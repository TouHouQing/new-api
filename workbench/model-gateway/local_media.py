# SPDX-License-Identifier: AGPL-3.0-or-later
"""Host-only media computations with idempotent, independently restorable receipts."""
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import uuid
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from local_speech import LocalSpeech
from media_separation import CHECKPOINT_SHA256, MAX_SECONDS, ROLES, decode_source, file_sha256, required_disk_bytes, result_roles


class SeparationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    model_name: Literal["htdemucs"] = "htdemucs"
    reference_audio: str = Field(min_length=1, max_length=44 * 1024 * 1024)
    stems: Literal["pair", "all"] = "pair"

    @model_validator(mode="after")
    def source(self):
        decode_source(self.reference_audio)
        return self


class LocalMedia(LocalSpeech):
    execution_name = "media"
    execution_timeout = 3600

    async def verify_runtime(self):
        self.runtime_ready = False
        if not self.python or not self.python.is_file() or not self.model or not self.model.is_file():
            return False
        try:
            if file_sha256(self.model) != CHECKPOINT_SHA256:
                return False
        except OSError:
            return False
        environment = os.environ.copy()
        environment.pop("PYTHONPATH", None)
        process = None
        options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
        try:
            code = "import importlib.util,json;print(json.dumps(all(importlib.util.find_spec(n) is not None for n in ['demucs','torch','soundfile','numpy'])))"
            process = await asyncio.create_subprocess_exec(str(self.python), "-X", "utf8", "-B", "-c", code, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=environment, **options)
            reply, _ = await asyncio.wait_for(process.communicate(), timeout=15)
            self.runtime_ready = process.returncode == 0 and json.loads(reply) is True
            if self.runtime_ready:
                self.checkpoint_stat = (self.model.stat().st_size, self.model.stat().st_mtime_ns)
        except (OSError, ValueError, TimeoutError):
            self.runtime_ready = False
        finally:
            if process and process.returncode is None:
                await self.stop_process(process)
        return self.runtime_ready

    def available(self):
        try:
            probe = self.ffmpeg.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
            return bool(self.runtime_ready and self.python.is_file() and self.ffmpeg.is_file() and probe.is_file() and self.checkpoint_stat == (self.model.stat().st_size, self.model.stat().st_mtime_ns))
        except (OSError, AttributeError):
            return False

    def directory(self, identity):
        try:
            identity = str(uuid.UUID(identity))
        except (ValueError, AttributeError) as error:
            raise HTTPException(400, "Invalid media execution identity") from error
        return self.receipts.directory / "media" / identity

    def lookup(self, identity):
        self.directory(identity)
        stored = self.receipts.for_prompt(identity)
        if not stored or stored[1].get("model") != "media":
            raise HTTPException(404, "Media receipt not found")
        receipt = stored[1]
        if receipt.get("stems") not in {"pair", "all"} or receipt.get("status") not in {"pending", "processing", "succeeded", "cancelled", "failed"} or receipt.get("checkpoint_sha256") != CHECKPOINT_SHA256:
            raise HTTPException(503, "Media receipt is invalid; inference was not repeated")
        return stored

    async def submit(self, request: SeparationRequest, key: str):
        digest = self.receipts.digest(key)
        payload = request.model_dump()
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        async with self.lock:
            previous = self.receipts.read(digest)
            if previous:
                if previous.get("model") != "media" or previous.get("fingerprint") != fingerprint:
                    raise HTTPException(409, "The original media submission has different inputs")
                self.receipts.write(digest, previous)
                return {"prompt_id": previous["prompt_id"], "status": previous["status"]}
            if not self.available():
                raise HTTPException(503, "Configure the installed offline Demucs Python, pinned weights and FFmpeg first")
            # Reserve the worst supported duration, including inputs waiting for
            # the CPU lease. A client duration hint cannot bypass disk admission.
            reserve = required_disk_bytes(MAX_SECONDS, len(result_roles(request.stems))) + 44 * 1024 * 1024
            pending_reserve = sum(getattr(task, "media_reserved_bytes", 0)+getattr(task,"lip_reserved_bytes",0) for engine in [self,*getattr(self,"storage_peers",[])] for task in engine.pending.values() if not task.done())
            if shutil.disk_usage(self.receipts.directory).free < reserve + pending_reserve:
                raise HTTPException(507, "Not enough free storage for every selected output; free space before starting")
            identity = str(uuid.uuid5(uuid.NAMESPACE_URL, "yingce-local-media:" + digest))
            directory = self.directory(identity)
            try:
                directory.mkdir(parents=True, exist_ok=False)
            except FileExistsError as error:
                raise HTTPException(409, "Unconfirmed media preparation exists; inspect saved receipts before another submission") from error
            receipt = {"model": "media", "prompt_id": identity, "fingerprint": fingerprint, "status": "pending", "stems": request.stems, "source_sha256": hashlib.sha256(decode_source(request.reference_audio)).hexdigest(), "checkpoint_sha256": CHECKPOINT_SHA256}
            try:
                self.receipts._write(directory / "input.json", payload)
                self.receipts.write(digest, receipt)
            except Exception:
                (directory / "input.json").unlink(missing_ok=True)
                if not any(directory.iterdir()):
                    directory.rmdir()
                raise
            task = asyncio.create_task(self.execute(digest, receipt, directory))
            task.media_reserved_bytes = reserve
            self.pending[identity] = task
            task.add_done_callback(lambda _: self.release_execution(identity, directory))
            return {"prompt_id": identity, "status": "pending"}

    def inference_command(self, directory):
        return [str(self.python), "-X", "utf8", "-B", str(Path(__file__).with_name("media_separation.py")), "--input", str(directory / "input.json"), "--model", str(self.model), "--ffmpeg", str(self.ffmpeg)]

    @staticmethod
    def cleanup_transients(directory):
        for name in ("input.json", "source.bin", "result.part.json", *(role + ".part.wav" for role in ROLES)):
            (directory / name).unlink(missing_ok=True)

    def verified_result(self, directory, receipt):
        result = json.loads((directory / "result.json").read_text(encoding="utf-8"))
        roles = result_roles(receipt["stems"])
        outputs = result["outputs"]
        if result.get("version") != 1 or result.get("model") != "htdemucs" or result.get("stems") != receipt["stems"] or result.get("checkpoint_sha256") != receipt["checkpoint_sha256"] or result.get("source_sha256") != receipt["source_sha256"] or len(outputs) != len(roles):
            raise ValueError("The saved separation manifest does not match its original inputs")
        duration, gain = result["source_duration"], result["shared_gain"]
        if result.get("sample_rate") != 44100 or result.get("channels") != 2 or not math.isfinite(duration) or not .1 <= duration <= MAX_SECONDS or not math.isfinite(gain) or not 0 < gain <= 1:
            raise ValueError("Invalid separation duration, audio format or shared gain")
        for role, output in zip(roles, outputs):
            if output.get("role") != role or output.get("filename") != role + ".wav" or output.get("name") != ROLES[role] or output.get("mime_type") != "audio/wav" or not .1 <= output["duration"] <= MAX_SECONDS or not 32 <= output["bytes"] <= 128 * 1024 * 1024:
                raise ValueError("Invalid separation output metadata")
            if abs(output["duration"] - duration) > 1 / 44100:
                raise ValueError("A separation track no longer covers the original source interval")
            path = directory / output["filename"]
            if path.is_symlink() or not path.is_file() or path.stat().st_size != output["bytes"] or file_sha256(path) != output["sha256"]:
                raise ValueError("A saved separation track cannot be verified")
        return result

    def completed(self, directory, receipt):
        try:
            self.verified_result(directory, receipt)
            return True
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            return False

    async def status(self, identity):
        digest, current = self.lookup(identity)
        if current["status"] not in {"succeeded", "cancelled", "failed"} and identity not in self.pending:
            if self.completed(self.directory(identity), current):
                current["status"] = "succeeded"
            else:
                current.update(status="failed", reason="execution_interrupted", message="Local media execution was interrupted; inspect saved outputs before explicitly starting another task")
            self.receipts.write(digest, current)
        if current["status"] == "succeeded":
            try:
                result = self.verified_result(self.directory(identity), current)
            except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
                raise HTTPException(409, "The saved media outputs cannot be verified; no inference was repeated") from error
            return {"prompt_id": identity, "status": "succeeded", "outputs": [{**output, "url": "/api/jobs/" + identity + "/outputs/" + str(index)} for index, output in enumerate(result["outputs"])], "source_sha256": result["source_sha256"], "checkpoint_sha256": result["checkpoint_sha256"], "shared_gain": result["shared_gain"]}
        return {key: current[key] for key in ("prompt_id", "status", "reason", "message") if key in current}
