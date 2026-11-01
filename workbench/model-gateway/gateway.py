# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local inference transport. Yingce owns projects, jobs, ACLs and billing.

ComfyUI prompt IDs are returned before inference and remain recoverable through
the upstream queue/history. The disk index only deduplicates transport receipts.
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import os
import secrets
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.responses import StreamingResponse

from reference_images import ReferenceImage, decode_reference
from speech_transcription import SpeechTranscription
from job_cancellation import cancel_job, was_interrupted
from local_agent import AgentRequest, infer_agent, recover_saved_agent
from agent_tokenizer import AgentTokenizer
from local_music import MusicOptions, music_inventory, music_workflow


@dataclass(frozen=True)
class Settings:
    comfy_url: str = "http://127.0.0.1:8188"
    ollama_url: str = "http://127.0.0.1:11434"
    text_model: str = "qwen3.5:9b"
    receipt_dir: Path = Path(".local/model-gateway-receipts")
    workflow_dir: Path = Path(__file__).parent / "workflows"
    asr_python: Path | None = None
    asr_model_dir: Path | None = None
    targeted_cancel: bool = False
    agent_tokenizer_dir: Path | None = None


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    model_name: str = Field(default="", max_length=200)
    prompt: str = Field(default="", max_length=30_000)
    negative: str = Field(default="", max_length=10_000)
    messages: list[dict] | None = Field(default=None, max_length=100)
    reference_images: list[str] = Field(default_factory=list, max_length=1)
    width: int = Field(default=1024, ge=128, le=2048)
    height: int = Field(default=1024, ge=128, le=2048)
    frames: int = Field(default=121, ge=1, le=241)
    seed: int = Field(default=-1, ge=-1, le=2**53-1)
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    context_length: int = Field(default=8192, ge=2048, le=32768)
    think: bool = False
    response_format: dict | None = None
    music: MusicOptions | None = None

    @field_validator("response_format")
    @classmethod
    def bounded_schema(cls, value):
        if value is None:
            return None
        if len(json.dumps(value, ensure_ascii=False).encode()) > 12_000:
            raise ValueError("structured output schema exceeds 12 KB")
        def check(item, depth=0):
            if depth > 16:
                raise ValueError("structured output schema is too deep")
            if isinstance(item, dict):
                if "$ref" in item:
                    raise ValueError("schema references are not supported")
                for child in item.values():
                    check(child, depth + 1)
            elif isinstance(item, list):
                for child in item:
                    check(child, depth + 1)
        check(value)
        return value

    @model_validator(mode="after")
    def structured_text_only(self):
        if self.response_format is not None and (self.model != "text" or self.think):
            raise ValueError("structured output requires ordinary non-thinking text inference")
        if self.model == "audio":
            if self.music is None or not self.prompt.strip() or len(self.prompt) > 3000:
                raise ValueError("Music requires a bounded style description and music options")
            if self.reference_images or self.messages or self.negative or self.think:
                raise ValueError("Music does not accept reference media, chat history or thinking")
        elif self.music is not None:
            raise ValueError("Music options require the audio model")
        return self

    def receipt_fingerprint(self):
        # An unused optional format must not invalidate already saved receipts.
        excluded = {name for name in ("response_format", "music") if getattr(self, name) is None}
        values = self.model_dump(exclude=excluded)
        return hashlib.sha256(json.dumps(values, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class Receipts:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def digest(key: str) -> str:
        if not key or len(key) > 200 or any(ord(char) < 33 or ord(char) > 126 for char in key):
            raise HTTPException(400, "A bounded Idempotency-Key is required")
        return hashlib.sha256(key.encode()).hexdigest()

    def read(self, digest: str) -> dict | None:
        if len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            raise HTTPException(400, "Invalid receipt identity")
        try:
            with (self.directory / (digest + ".json")).open(encoding="utf-8") as stream:
                value = json.load(stream)
            if not isinstance(value, dict) or value.get("version") != 1:
                raise ValueError("invalid receipt")
            return value
        except FileNotFoundError:
            return None
        except (ValueError, OSError) as error:
            raise HTTPException(503, "Receipt cannot be read; submission was not repeated") from error

    def write(self, digest: str, value: dict):
        # Persist the main receipt first; the index is recoverable from the
        # ComfyUI queue/history metadata after a lost submit response.
        self.read(digest)  # Validate the bounded identity before writing.
        self._write(self.directory / (digest + ".json"), value)
        if value.get("prompt_id"):
            self._write(self.prompt_path(value["prompt_id"]), {"receipt_digest": digest})

    def prompt_path(self, prompt_id: str) -> Path:
        if not isinstance(prompt_id, str) or not prompt_id or len(prompt_id) > 128 or any(char not in "0123456789abcdef-" for char in prompt_id.lower()):
            raise HTTPException(400, "Invalid ComfyUI prompt identity")
        return self.directory / ("prompt-" + prompt_id + ".json")

    def for_prompt(self, prompt_id: str) -> tuple[str, dict] | None:
        try:
            value = json.loads(self.prompt_path(prompt_id).read_text(encoding="utf-8"))
            if value.get("version") != 1 or not isinstance(value.get("receipt_digest"), str):
                raise ValueError("Invalid prompt receipt index")
            receipt = self.read(value["receipt_digest"])
            if receipt is None or receipt.get("prompt_id") != prompt_id:
                raise ValueError("Prompt receipt index does not match its submission")
            return value["receipt_digest"], receipt
        except FileNotFoundError:
            return None
        except (ValueError, OSError, AttributeError) as error:
            raise HTTPException(503, "Prompt receipt cannot be verified") from error

    def _write(self, destination: Path, value: dict):
        temporary = None
        try:
            descriptor, temporary = tempfile.mkstemp(prefix="receipt-", dir=self.directory)
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                json.dump({"version": 1, **value}, stream, ensure_ascii=False, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
        except OSError as error:
            raise HTTPException(507, "Cannot persist the local model receipt") from error
        finally:
            if temporary is not None and os.path.exists(temporary):
                try:
                    os.unlink(temporary)
                except OSError:
                    pass  # A failed write still reports the original storage failure.


class InferenceTransport:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client
        self.receipts = Receipts(settings.receipt_dir)
        self.device = asyncio.Lock()
        self.family: str | None = None
        self.cancellation = asyncio.Lock()
        self.agent_tokenizer = None
        self.agent_tokenizer_error = False
        if settings.agent_tokenizer_dir:
            try:
                self.agent_tokenizer = AgentTokenizer(settings.agent_tokenizer_dir, settings.text_model)
            except (ImportError, OSError, ValueError, RuntimeError):
                # An optional Agent tokenizer must not take image/video receipt
                # recovery or scoped cancellation offline.
                self.agent_tokenizer_error = True

    def validate_model(self, request: GenerateRequest):
        allowed = {"text": {self.settings.text_model}, "image": {"flux2-klein", "flux-2-klein-4b-fp8.safetensors"}, "video": {"wan2.2-ti2v-5b", "wan2.2_ti2v_5B_fp16.safetensors"}, "audio": {"acestep-1.5-turbo"}}
        if request.model not in allowed or (request.model_name and request.model_name not in allowed[request.model]):
            raise HTTPException(400, "Configured model does not match this local transport; no inference was submitted")

    async def comfy(self, method: str, route: str, **kwargs) -> dict:
        try:
            response = await self.client.request(method, self.settings.comfy_url.rstrip("/") + route, **kwargs)
            response.raise_for_status()
            if method == "POST" and route in {"/free", "/queue", "/interrupt"} and not response.content:
                return {}
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise HTTPException(502, "ComfyUI request failed") from error

    async def wait_idle(self):
        # Other ComfyUI clients can still own work. Never unload their model
        # while it is running; keep this transport request before submission.
        deadline = time.monotonic() + 120
        while True:
            queue = await self.comfy("GET", "/queue")
            if not isinstance(queue.get("queue_running"), list) or not isinstance(queue.get("queue_pending"), list):
                raise HTTPException(502, "Invalid ComfyUI queue response")
            if not queue["queue_running"] and not queue["queue_pending"]:
                return
            if time.monotonic() >= deadline:
                raise HTTPException(429, "Local GPU is busy; no new inference was submitted", headers={"Retry-After": "3"})
            await asyncio.sleep(1)

    def workflow(self, request: GenerateRequest, digest: str, reference_name: str = "") -> dict:
        if request.model == "audio":
            return music_workflow(request.prompt, request.music, request.seed if request.seed >= 0 else secrets.randbelow(2**31), digest)
        name = {"image": "flux2_klein_api.json", "video": "wan22_ti2v_api.json"}.get(request.model)
        if name is None:
            raise HTTPException(400, "Submit supports image and video")
        if request.width % 16 or request.height % 16:
            raise HTTPException(400, "Image and video dimensions must be divisible by 16")
        if request.model == "video" and (request.frames - 1) % 4:
            raise HTTPException(400, "Wan frame count must be 4n+1")
        try:
            source = json.loads((self.settings.workflow_dir / name).read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as error:
            raise HTTPException(503, "Local model workflow is unavailable") from error
        values = {"__PROMPT__": request.prompt, "__NEGATIVE__": request.negative,
                  "__WIDTH__": request.width, "__HEIGHT__": request.height,
                  "__FRAMES__": request.frames, "__SEED__": request.seed if request.seed >= 0 else secrets.randbelow(2**31)}

        def visit(value):
            if isinstance(value, dict):
                return {key: visit(child) for key, child in value.items()}
            if isinstance(value, list):
                return [visit(child) for child in value]
            if isinstance(value, str) and value in values:
                return values[value]
            return value

        workflow = visit(copy.deepcopy(source))
        if request.model == "video" and request.negative:
            workflow["7"]["inputs"]["text"] = request.negative
        for node in workflow.values():
            if node.get("class_type") in {"SaveImage", "SaveVideo", "VHS_VideoCombine"}:
                node.get("inputs", {})["filename_prefix"] = "yingce/" + digest[:24]
        if reference_name:
            workflow["yingce-reference"] = {"class_type": "LoadImage", "inputs": {"image": reference_name}}
            if request.model == "video":
                workflow["55"]["inputs"]["start_image"] = ["yingce-reference", 0]
            else:
                workflow["yingce-reference-encode"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["yingce-reference", 0], "vae": ["63", 0]}}
                for label, source_id in (("positive", "67"), ("negative", "71")):
                    node_id = "yingce-reference-" + label
                    workflow[node_id] = {"class_type": "ReferenceLatent", "inputs": {"conditioning": [source_id, 0], "latent": ["yingce-reference-encode", 0]}}
                    workflow["70"]["inputs"][label] = [node_id, 0]
        return workflow

    async def upload_reference(self, image: ReferenceImage) -> str:
        name = image.digest + ".png"
        uploaded = await self.comfy("POST", "/upload/image", files={"image": (name, image.png, "image/png")}, data={"subfolder": "yingce-reference", "type": "input", "overwrite": "true"})
        if uploaded.get("name") != name or uploaded.get("subfolder") != "yingce-reference" or uploaded.get("type") != "input":
            raise HTTPException(502, "ComfyUI reference upload returned a different identity")
        return "yingce-reference/" + name

    async def recover(self, digest: str, receipt: dict) -> dict:
        if receipt.get("prompt_id") or receipt.get("result"):
            return receipt
        if receipt.get("operation") == "agent" and "upstream_response" in receipt:
            return recover_saved_agent(self, digest, receipt)
        if receipt.get("model") not in {"image", "video", "audio"}:
            raise HTTPException(409, "Local execution outcome is uncertain; inference was not repeated")
        queue = await self.comfy("GET", "/queue")
        history = await self.comfy("GET", "/history?max_items=200")
        candidates = queue.get("queue_running", []) + queue.get("queue_pending", [])
        candidates += [entry.get("prompt", []) for entry in history.values() if isinstance(entry, dict)]
        for item in candidates:
            if isinstance(item, list) and len(item) >= 4 and isinstance(item[3], dict) and item[3].get("yingce_request") == digest:
                receipt["prompt_id"] = item[1]
                self.receipts.write(digest, receipt)
                return receipt
        raise HTTPException(409, "Submission outcome is uncertain; inspect the local queue before retrying")

    async def submit(self, request: GenerateRequest, key: str) -> dict:
        self.validate_model(request)
        if request.model not in {"image", "video", "audio"}:
            raise HTTPException(400, "Submit supports image, video and music")
        if not request.prompt.strip():
            raise HTTPException(400, "A prompt is required")
        references = [decode_reference(value) for value in request.reference_images]
        digest = self.receipts.digest(key)
        fingerprint = request.receipt_fingerprint()
        async with self.device:
            previous = self.receipts.read(digest)
            if previous:
                if previous.get("fingerprint") != fingerprint:
                    raise HTTPException(409, "Idempotency-Key was used with different inputs")
                recovered = await self.recover(digest, previous)
                return {"prompt_id": recovered["prompt_id"], "status": "pending", "reused": True}
            workflow = self.workflow(request, digest)
            if references:
                workflow = self.workflow(request, digest, await self.upload_reference(references[0]))
            await self.wait_idle()
            try:
                unloaded = await self.client.post(self.settings.ollama_url + "/api/generate", json={"model": self.settings.text_model, "keep_alive": 0})
                unloaded.raise_for_status()
            except httpx.HTTPError as error:
                raise HTTPException(503, "Cannot release the text model before local image/video inference") from error
            if self.family != request.model:
                await self.comfy("POST", "/free", json={"unload_models": True, "free_memory": True})
            receipt = {"model": request.model, "fingerprint": fingerprint, "created_at": time.time(), "status": "submitting", "reference_sha256": [image.digest for image in references]}
            self.receipts.write(digest, receipt)
            submitted = await self.comfy("POST", "/prompt", json={"prompt": workflow, "client_id": "yingce", "extra_data": {"yingce_request": digest}})
            if not isinstance(submitted.get("prompt_id"), str) or not submitted["prompt_id"]:
                raise HTTPException(502, "ComfyUI did not return a prompt receipt")
            receipt["prompt_id"] = submitted["prompt_id"]
            self.receipts.write(digest, receipt)
            self.family = request.model
            return {"prompt_id": receipt["prompt_id"], "status": "pending", "reused": False}

    async def status(self, prompt_id: str) -> dict:
        if not prompt_id or len(prompt_id) > 128 or any(char not in "0123456789abcdef-" for char in prompt_id.lower()):
            raise HTTPException(400, "Invalid ComfyUI prompt identity")
        history = await self.comfy("GET", "/history/" + prompt_id)
        stored = self.receipts.for_prompt(prompt_id)
        receipt = stored[1] if stored else {}
        entry = history.get(prompt_id)
        if entry is None:
            queue = await self.comfy("GET", "/queue")
            if any(len(item) > 1 and item[1] == prompt_id for item in queue.get("queue_running", [])):
                return {"prompt_id": prompt_id, "status": "processing"}
            if any(len(item) > 1 and item[1] == prompt_id for item in queue.get("queue_pending", [])):
                return {"prompt_id": prompt_id, "status": "pending"}
            if receipt.get("cancel_state") in {"removed_pending", "interrupted"}:
                return {"prompt_id": prompt_id, "status": "cancelled"}
            if receipt.get("cancel_requested_at"):
                return {"prompt_id": prompt_id, "status": "processing", "message": "Cancellation requested; waiting for the exact ComfyUI execution receipt"}
            # A restart or manual queue/history reset can destroy ComfyUI's
            # execution receipt while the native job still exists. End polling
            # explicitly; a transport 404 is otherwise retried as a network
            # failure and leaves the user watching a job that cannot resume.
            return {"prompt_id": prompt_id, "status": "failed", "reason": "receipt_missing", "message": "Local execution receipt is missing after a service restart or queue reset; no inference was automatically repeated. Check saved outputs before starting a new task."}
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            if receipt.get("cancel_requested_at") and was_interrupted(entry, prompt_id):
                if receipt.get("cancel_state") != "interrupted":
                    receipt["cancel_state"] = "interrupted"
                    receipt["cancel_confirmed_at"] = time.time()
                    self.receipts.write(stored[0], receipt)
                return {"prompt_id": prompt_id, "status": "cancelled"}
            return {"prompt_id": prompt_id, "status": "failed", "message": "Local model workflow execution failed"}
        if not status.get("completed"):
            return {"prompt_id": prompt_id, "status": "processing"}
        outputs = []
        for node in entry.get("outputs", {}).values():
            for kind in ("images", "gifs", "videos", "audio"):
                for artifact in node.get(kind, []):
                    filename = artifact.get("filename", "")
                    if not filename:
                        continue
                    query = urlencode({"filename": filename, "subfolder": artifact.get("subfolder", ""), "type": artifact.get("type", "output")})
                    outputs.append({"url": f"/api/jobs/{prompt_id}/outputs/{len(outputs)}", "filename": filename, "_comfy_query": query})
        if not outputs:
            return {"prompt_id": prompt_id, "status": "failed", "message": "Workflow completed without a saved output"}
        return {"prompt_id": prompt_id, "status": "succeeded", "outputs": outputs}

    async def artifact(self, prompt_id: str, index: int):
        state = await self.status(prompt_id)
        outputs = state.get("outputs", [])
        if state["status"] != "succeeded" or not 0 <= index < len(outputs):
            raise HTTPException(404, "Saved output is unavailable")
        address = self.settings.comfy_url + "/view?" + outputs[index]["_comfy_query"]
        try:
            response = await self.client.send(self.client.build_request("GET", address), stream=True)
            response.raise_for_status()
        except httpx.HTTPError as error:
            if "response" in locals():
                await response.aclose()
            raise HTTPException(502, "Saved ComfyUI output cannot be read") from error

        async def chunks():
            try:
                async for chunk in response.aiter_bytes():
                    yield chunk
            finally:
                await response.aclose()

        # Media stays behind the configured gateway address, including when the
        # Yingce backend runs inside Docker and cannot access host loopback.
        return StreamingResponse(chunks(), media_type=response.headers.get("content-type", "application/octet-stream"), headers={"Cache-Control": "private, no-store"})

    async def text(self, request: GenerateRequest, key: str) -> dict:
        self.validate_model(request)
        if request.model != "text":
            raise HTTPException(400, "Text endpoint requires model=text")
        messages = request.messages or [{"role": "user", "content": request.prompt}]
        if any(set(message) - {"role", "content"} or not isinstance(message.get("content"), str) or len(message["content"]) > 100_000 or message.get("role") not in {"system", "user", "assistant"} for message in messages):
            raise HTTPException(400, "Text messages must be bounded plain conversation messages")
        if not any(message["content"].strip() for message in messages) or sum(len(message["content"]) for message in messages) > 200_000:
            raise HTTPException(400, "Text messages are empty or too large")
        references = [decode_reference(value) for value in request.reference_images]
        # UTF-8 bytes are a conservative budget for the byte-level tokenizer.
        # Reserve space for the chat template, vision tokens and requested
        # output instead of letting Ollama silently truncate the conversation.
        input_budget = sum(len(message["content"].encode("utf-8")) + 32 for message in messages)
        input_budget += 512 + 2048 * len(references)
        if self.agent_tokenizer:
            serialized = json.dumps(messages, ensure_ascii=False)
            input_budget = self.agent_tokenizer.count(serialized) + max(4096,64*len(messages)) + 2048*len(references)
        if input_budget + request.max_tokens > request.context_length:
            raise HTTPException(400, "Conversation and output exceed the conservative local context budget; shorten the input or reduce max_tokens")
        messages = copy.deepcopy(messages)
        if references:
            if messages[-1]["role"] != "user":
                raise HTTPException(400, "A visual request must end with the current user message")
            messages[-1]["images"] = [image.base64() for image in references]
        digest = self.receipts.digest(key)
        fingerprint = request.receipt_fingerprint()
        async with self.device:
            previous = self.receipts.read(digest)
            if previous:
                if previous.get("fingerprint") != fingerprint:
                    raise HTTPException(409, "Idempotency-Key was used with different inputs")
                return (await self.recover(digest, previous))["result"]
            if self.agent_tokenizer:
                await self.agent_tokenizer.verify_model(self.client,self.settings.ollama_url)
            await self.wait_idle()
            await self.comfy("POST", "/free", json={"unload_models": True, "free_memory": True})
            self.family = None
            receipt = {"model": "text", "fingerprint": fingerprint, "created_at": time.time(), "status": "submitting"}
            self.receipts.write(digest, receipt)
            try:
                body = {"model": self.settings.text_model, "messages": messages, "stream": False, "keep_alive": 0, "think": request.think, "options": {"num_ctx": request.context_length, "num_predict": request.max_tokens}}
                if request.response_format is not None:
                    body["format"] = request.response_format
                    body["options"]["temperature"] = 0
                response = await self.client.post(self.settings.ollama_url + "/api/chat", json=body)
                response.raise_for_status()
                payload = response.json()
                content = payload["message"]["content"]
                if not isinstance(content, str) or not content.strip():
                    raise ValueError("empty model output")
            except (httpx.HTTPError, KeyError, ValueError) as error:
                raise HTTPException(502, "Local text inference failed; inspect the existing receipt before retrying") from error
            usage = {"prompt_tokens": payload.get("prompt_eval_count", 0), "completion_tokens": payload.get("eval_count", 0)}
            usage["total_tokens"] = usage["prompt_tokens"] + usage["completion_tokens"]
            result = {"model": self.settings.text_model, "content": content, "usage": usage}
            receipt["result"] = result
            self.receipts.write(digest, receipt)
            return result

    async def model_inventory(self) -> dict:
        weights: dict[str, set[str]] = {}
        missing_service = []
        try:
            response = await self.client.get(self.settings.ollama_url + "/api/tags", timeout=3)
            response.raise_for_status()
            text_names = {item.get("name") for item in response.json().get("models", [])}
        except (httpx.HTTPError, ValueError, TypeError):
            text_names = set()
            missing_service.append("ollama")
        for loader, field in (("UNETLoader", "unet_name"), ("CLIPLoader", "clip_name"), ("VAELoader", "vae_name")):
            try:
                response = await self.client.get(self.settings.comfy_url + "/object_info/" + loader, timeout=3)
                response.raise_for_status()
                weights[field] = set(response.json()[loader]["input"]["required"][field][0])
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                weights[field] = set()
                if "comfyui" not in missing_service:
                    missing_service.append("comfyui")
        models = []
        for mode, name in (("text", self.settings.text_model), ("image", "FLUX.2 Klein 4B"), ("video", "Wan 2.2 TI2V 5B")):
            missing = []
            if self.settings.text_model not in text_names:
                missing.append(self.settings.text_model)
            if mode != "text":
                workflow_name = "flux2_klein_api.json" if mode == "image" else "wan22_ti2v_api.json"
                try:
                    source = json.loads((self.settings.workflow_dir / workflow_name).read_text(encoding="utf-8-sig"))
                    for node in source.values():
                        for field in weights:
                            required = node.get("inputs", {}).get(field)
                            if required and required not in weights[field]:
                                missing.append(required)
                except (OSError, ValueError, TypeError):
                    missing.append("workflow:" + workflow_name)
            models.append({"model": mode, "name": name, "available": not missing and not missing_service, "missing_weights": missing,
                           "max_references": 1, "streaming": False, "tools": False, "audio": False,
                           **({"fps": 24, "reference_role": "first_frame"} if mode == "video" else {})})
        try:
            models.append(await music_inventory(self))
        except HTTPException:
            models.append({"model": "audio", "name": "ACE-Step 1.5 Turbo", "model_name": "acestep-1.5-turbo", "available": False, "missing_weights": ["comfyui"], "max_references": 0, "audio": True})
        return {"models": models, "unavailable_services": missing_service}


def create_app(settings: Settings | None = None, client: httpx.AsyncClient | None = None) -> FastAPI:
    settings = settings or Settings(comfy_url=os.getenv("COMFY_URL", "http://127.0.0.1:8188").rstrip("/"), ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"), text_model=os.getenv("TEXT_MODEL", "qwen3.5:9b"), receipt_dir=Path(os.getenv("MODEL_RECEIPT_DIR", ".local/model-gateway-receipts")), asr_python=Path(os.environ["ASR_PYTHON"]) if os.getenv("ASR_PYTHON") else None, asr_model_dir=Path(os.environ["ASR_MODEL_DIR"]) if os.getenv("ASR_MODEL_DIR") else None, targeted_cancel=os.getenv("MODEL_GATEWAY_TARGETED_CANCEL") == "1", agent_tokenizer_dir=Path(os.environ["AGENT_TOKENIZER_DIR"]) if os.getenv("AGENT_TOKENIZER_DIR") else None)

    @asynccontextmanager
    async def lifespan(app):
        transport_client = client or httpx.AsyncClient(timeout=httpx.Timeout(600, connect=5), trust_env=False)
        app.state.transport = InferenceTransport(settings, transport_client)
        app.state.transcription = SpeechTranscription(app.state.transport.receipts, settings.asr_python, settings.asr_model_dir)
        yield
        if client is None:
            await transport_client.aclose()

    app = FastAPI(title="影策本地模型传输", lifespan=lifespan)

    @app.post("/api/submit")
    async def submit(request: GenerateRequest, idempotency_key: str = Header(default="")):
        return await app.state.transport.submit(request, idempotency_key)

    @app.get("/api/jobs/{prompt_id}")
    async def status(prompt_id: str):
        state = await app.state.transport.status(prompt_id)
        for item in state.get("outputs", []):
            item.pop("_comfy_query", None)
        return state

    @app.get("/api/jobs/{prompt_id}/outputs/{index}")
    async def artifact(prompt_id: str, index: int):
        return await app.state.transport.artifact(prompt_id, index)

    @app.post("/api/jobs/{prompt_id}/cancel")
    async def cancel(prompt_id: str):
        return await cancel_job(app.state.transport, prompt_id)

    @app.get("/api/receipts/{digest}")
    async def receipt(digest: str):
        stored = app.state.transport.receipts.read(digest)
        if not stored:
            raise HTTPException(404, "Receipt not found")
        recovered = await app.state.transport.recover(digest, stored)
        return {"prompt_id": recovered.get("prompt_id"), "status": "pending" if recovered.get("prompt_id") else "succeeded", "result": recovered.get("result")}

    @app.post("/api/generate")
    async def text(request: GenerateRequest, idempotency_key: str = Header(default="")):
        return await app.state.transport.text(request, idempotency_key)

    @app.post("/api/agent/generate")
    async def agent(request: AgentRequest, idempotency_key: str = Header(default="")):
        return await infer_agent(app.state.transport, request, idempotency_key)

    @app.post("/inference")
    async def transcribe(request: Request, idempotency_key: str = Header(default="")):
        return await app.state.transcription.infer(request, idempotency_key)

    @app.get("/api/health")
    async def health():
        state = {"comfyui": False, "ollama": False, "transcription": app.state.transcription.available(), "targeted_cancel": settings.targeted_cancel, "structured_outputs": True}
        for name, url in (("comfyui", settings.comfy_url + "/system_stats"), ("ollama", settings.ollama_url + "/api/tags")):
            try:
                response = await app.state.transport.client.get(url, timeout=3)
                state[name] = response.is_success
            except httpx.HTTPError:
                pass
        state["agent_tokenizer_configured"] = settings.agent_tokenizer_dir is not None
        state["agent_tokenizer_ready"] = False
        if app.state.transport.agent_tokenizer and not app.state.transport.agent_tokenizer_error and state["ollama"]:
            try:
                await app.state.transport.agent_tokenizer.verify_model(app.state.transport.client, settings.ollama_url)
                state["agent_tokenizer_ready"] = True
            except HTTPException:
                pass
        state["agent_budget_method"] = "verified-tokenizer-with-template-reserve" if state["agent_tokenizer_ready"] else "utf8-bytes-with-reserve"
        return state

    @app.get("/api/models")
    async def models():
        return await app.state.transport.model_inventory()

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("MODEL_GATEWAY_PORT", "8001")))
