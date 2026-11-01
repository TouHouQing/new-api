# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline speech execution receipts; Yingce remains the authoritative job owner."""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import signal
import subprocess
import uuid
from pathlib import Path
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

FORMATS = {"wav": "audio/wav", "mp3": "audio/mpeg", "flac": "audio/flac", "opus": "audio/ogg"}
LANGUAGES = {"ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh"}
WEIGHTS = ("ve.pt", "s3gen.pt", "t3_mtl23ls_v2.safetensors", "grapheme_mtl_merged_expanded_v1.json", "conds.pt")


class SpeechRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    model_name: Literal["chatterbox-multilingual"] = "chatterbox-multilingual"
    prompt: str = Field(min_length=1, max_length=3000)
    language: str = "zh"
    voice: Literal["default", "alloy", "sample"] = "default"
    format: Literal["wav", "mp3", "flac", "opus"] = "wav"
    speed: float = Field(default=1, ge=0.5, le=2, allow_inf_nan=False)
    expression: float = Field(default=0.5, ge=0, le=2, allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=2**32-1)
    reference_audio: str = Field(default="", max_length=24 * 1024 * 1024)
    confirm_voice_rights: bool = False

    @model_validator(mode="after")
    def validate_voice(self):
        if not self.prompt.strip() or self.language not in LANGUAGES:
            raise ValueError("A nonempty script and supported speech language are required")
        if self.reference_audio:
            if not self.confirm_voice_rights or self.voice != "sample":
                raise ValueError("Using a voice reference requires explicit rights confirmation and sample mode")
            decode_voice_reference(self.reference_audio)
        elif self.voice == "sample":
            raise ValueError("The selected voice requires its original owned audio reference")
        return self


def decode_voice_reference(value: str) -> bytes:
    header, separator, encoded = value.partition(",")
    if separator != "," or not re.fullmatch(r"data:audio/(?:wav|x-wav|mpeg|mp3|flac|ogg|opus|webm|aac|mp4|x-m4a);base64", header):
        raise ValueError("Voice references must contain uploaded audio bytes, not URLs")
    try:
        result = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Invalid voice reference encoding") from error
    if not 32 <= len(result) <= 16 * 1024 * 1024:
        raise ValueError("Voice reference must be at most 16 MiB")
    return result


class LocalSpeech:
    execution_name = "speech"
    execution_timeout = 1200

    def __init__(self, receipts, python: Path | None, model: Path | None, ffmpeg: Path | None):
        self.receipts, self.python, self.model, self.ffmpeg = receipts, python, model, ffmpeg
        self.lock = asyncio.Lock()
        self.pending: dict[str, asyncio.Task] = {}
        self.processes: dict[str, asyncio.subprocess.Process] = {}
        self.process_lock = asyncio.Lock()
        self.runtime_ready = False

    def available(self):
        probe = self.ffmpeg.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe") if self.ffmpeg else None
        return bool(self.runtime_ready and self.python and self.python.is_file() and self.ffmpeg and self.ffmpeg.is_file() and probe.is_file() and self.model and all((self.model / name).is_file() for name in WEIGHTS))

    async def verify_runtime(self):
        if not self.python or not self.python.is_file():
            return False
        environment = os.environ.copy();environment.pop("PYTHONPATH", None)
        environment.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1")
        process = None
        try:
            code = "import importlib.util,json; print(json.dumps(all(importlib.util.find_spec(n) is not None for n in ['chatterbox','torch','soundfile','numpy','fastapi','pydantic'])))"
            options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            process = await asyncio.create_subprocess_exec(str(self.python), "-X", "utf8", "-B", "-c", code, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=environment, **options)
            reply, _ = await asyncio.wait_for(process.communicate(), timeout=15)
            self.runtime_ready = process.returncode == 0 and json.loads(reply) is True
        except (OSError, ValueError, TimeoutError):
            self.runtime_ready = False
        finally:
            if process and process.returncode is None:
                await self.stop_process(process)
        return self.runtime_ready

    def directory(self, identity):
        try:
            identity = str(uuid.UUID(identity))
        except (ValueError, AttributeError) as error:
            raise HTTPException(400, "Invalid speech execution identity") from error
        return self.receipts.directory / "speech" / identity

    def lookup(self, identity):
        self.directory(identity)
        stored = self.receipts.for_prompt(identity)
        if not stored or stored[1].get("model") != "audio":
            raise HTTPException(404, "Speech receipt not found")
        if stored[1].get("format") not in FORMATS or stored[1].get("status") not in {"pending", "processing", "succeeded", "cancelled", "failed"}:
            raise HTTPException(503, "Speech receipt is invalid; inference was not repeated")
        return stored

    async def submit(self, request: SpeechRequest, key: str):
        if not self.available():
            raise HTTPException(503, "Configure the installed offline speech Python, model and FFmpeg first")
        digest = self.receipts.digest(key)
        payload = request.model_dump()
        fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        async with self.lock:
            previous = self.receipts.read(digest)
            if previous:
                if previous.get("model") != "audio" or previous.get("fingerprint") != fingerprint:
                    raise HTTPException(409, "The original speech submission has different inputs")
                self.receipts.write(digest, previous)  # Repair a lost secondary index, without another inference.
                return {"prompt_id": previous["prompt_id"], "status": previous["status"]}
            identity = str(uuid.uuid5(uuid.NAMESPACE_URL, "yingce-local-speech:" + digest))
            directory = self.directory(identity)
            try:
                directory.mkdir(parents=True, exist_ok=False)
            except FileExistsError as error:
                raise HTTPException(409, "Unconfirmed speech preparation exists; inspect saved receipts before another submission") from error
            receipt = {"model": "audio", "prompt_id": identity, "fingerprint": fingerprint, "status": "pending", "format": request.format, "voice_rights_confirmed": bool(request.reference_audio and request.confirm_voice_rights)}
            try:
                self.receipts._write(directory / "input.json", payload)
                self.receipts.write(digest, receipt)
            except Exception:
                (directory / "input.json").unlink(missing_ok=True)
                if not any(directory.iterdir()):
                    directory.rmdir()
                raise
            task = asyncio.create_task(self.execute(digest, receipt, directory))
            self.pending[identity] = task
            task.add_done_callback(lambda _: self.release_execution(identity, directory))
            return {"prompt_id": identity, "status": "pending"}

    async def execute(self, digest, receipt, directory):
        identity = receipt["prompt_id"]
        process = None
        # This lock is a CPU resource lease, not another persistent task queue.
        # A restart never scans pending receipts and re-runs them independently.
        try:
            async with self.execution_lock():
                current = self.receipts.read(digest)
                if current.get("cancel_requested"):
                    return
                current["status"] = "processing"
                self.receipts.write(digest, current)
                environment = os.environ.copy()
                environment.pop("PYTHONPATH", None)  # Use the configured speech environment's own tensor/audio packages.
                environment.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1")
                options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
                log = (directory / "inference-private.log").open("wb")
                try:
                    process = await asyncio.create_subprocess_exec(*self.inference_command(directory), stdout=log, stderr=log, env=environment, **options)
                    self.processes[identity] = process
                    try:
                        await asyncio.wait_for(process.wait(), timeout=self.execution_timeout)
                    except TimeoutError:
                        await self.stop_process(process)
                    current = self.receipts.read(digest)
                    if self.completed(directory, current):
                        current["status"] = "succeeded"
                    elif current.get("cancel_requested"):
                        current["status"] = "cancelled"
                    else:
                        current.update(status="failed", reason=self.execution_name + "_inference_failed", message="Local " + self.execution_name + " could not finish; the private execution log was retained")
                    self.receipts.write(digest, current)
                finally:
                    if process and process.returncode is None:
                        await self.stop_process(process)
                    self.processes.pop(identity, None)
                    log.close()
        except asyncio.CancelledError:
            process = self.processes.get(identity)
            if process:
                await self.stop_process(process)
            raise
        except Exception:
            current = self.receipts.read(digest)
            current.update(status="failed", reason=self.execution_name + "_execution_failed", message="Local " + self.execution_name + " execution failed; no automatic inference retry was made")
            self.receipts.write(digest, current)
        finally:
            self.processes.pop(identity, None)
            self.cleanup_transients(directory)

    def inference_command(self, directory):
        return [str(self.python), "-X", "utf8", "-B", str(Path(__file__).with_name("synthesize_local.py")), "--input", str(directory / "input.json"), "--model", str(self.model), "--ffmpeg", str(self.ffmpeg)]

    def release_execution(self, identity, directory):
        self.pending.pop(identity, None)
        # A task cancelled before its first scheduler turn never enters execute's
        # finally block. Its uploaded reference still needs to be reclaimed.
        self.cleanup_transients(directory)

    @staticmethod
    def cleanup_transients(directory):
        for name in ("input.json", "reference.bin", "reference.wav", "generated.wav", "output.part.wav", "output.part.mp3", "output.part.flac", "output.part.opus"):
            (directory / name).unlink(missing_ok=True)

    def execution_lock(self):
        if not hasattr(self, "cpu_lock"):
            self.cpu_lock = asyncio.Lock()
        return self.cpu_lock

    def completed(self, directory, receipt):
        try:
            result = json.loads((directory / "result.json").read_text())
            output = directory / ("output." + receipt["format"])
            if result["format"] != receipt["format"] or not 0 < result["duration"] <= 600 or not 32 <= result["bytes"] <= 128 * 1024 * 1024 or output.stat().st_size != result["bytes"]:
                return False
            return hashlib.sha256(output.read_bytes()).hexdigest() == result["sha256"]
        except (FileNotFoundError, ValueError, KeyError, TypeError, OSError):
            return False

    async def status(self, identity):
        digest, current = self.lookup(identity)
        if current["status"] not in {"succeeded", "cancelled", "failed"} and identity not in self.pending:
            if self.completed(self.directory(identity), current):
                current["status"] = "succeeded"
            else:
                current.update(status="failed", reason="execution_interrupted", message="Local speech was interrupted. Check saved outputs before explicitly starting another task; inference was not repeated")
            self.receipts.write(digest, current)
        if current["status"] == "succeeded":
            if not self.completed(self.directory(identity), current):
                raise HTTPException(409, "The saved speech output cannot be verified; no inference was repeated")
            return {"prompt_id": identity, "status": "succeeded", "outputs": [{"url": "/api/jobs/" + identity + "/outputs/0", "filename": "output." + current["format"]}]}
        return {key: current[key] for key in ("prompt_id", "status", "reason", "message") if key in current}

    async def stop_process(self, process):
        async with self.process_lock:
            await self._stop_process(process)

    async def _stop_process(self, process):
        if process.returncode is not None:
            return
        if os.name == "nt":
            killer = await asyncio.create_subprocess_exec("taskkill", "/PID", str(process.pid), "/T", "/F", stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
            await killer.wait()
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        await process.wait()

    async def cancel(self, identity):
        digest, current = self.lookup(identity)
        if current["status"] in {"succeeded", "cancelled", "failed"}:
            return await self.status(identity)
        current["cancel_requested"] = True
        self.receipts.write(digest, current)
        process = self.processes.get(identity)
        if process:
            await self.stop_process(process)
        task = self.pending.get(identity)
        if task and process:
            await asyncio.shield(task)
        elif task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        current = self.receipts.read(digest)
        if self.completed(self.directory(identity), current):
            current["status"] = "succeeded"
        elif current["status"] not in {"succeeded", "failed"}:
            current["status"] = "cancelled"
        self.receipts.write(digest, current)
        return await self.status(identity)

    async def close(self):
        for process in list(self.processes.values()):
            await self.stop_process(process)
        for task in list(self.pending.values()):
            task.cancel()
        await asyncio.gather(*list(self.pending.values()), return_exceptions=True)
