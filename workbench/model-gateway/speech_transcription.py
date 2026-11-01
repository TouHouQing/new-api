# SPDX-License-Identifier: AGPL-3.0-or-later
"""Whisper-compatible transport using installed offline model files.

There is no second task queue: Yingce owns the job and the caller's request
identity owns this receipt. Temporary audio and subprocesses are reclaimed.
"""
import asyncio
import hashlib
import io
import json
import os
import re
import tempfile
import time
import wave
from email.parser import BytesParser
from email.policy import default
from pathlib import Path

from fastapi import HTTPException, Request

MAX_TRANSCRIPTION_BYTES = 32 * 1024 * 1024


def parse_transcription_form(content_type: str, raw: bytes) -> tuple[bytes, str]:
    if not content_type.startswith("multipart/form-data;") or len(content_type) > 300:
        raise HTTPException(400, "Transcription requires a multipart WAV file")
    message = BytesParser(policy=default).parsebytes(("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode("ascii") + raw)
    if not message.is_multipart():
        raise HTTPException(400, "Invalid transcription multipart body")
    parts = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name not in {"file", "language", "response_format"} or name in parts:
            raise HTTPException(400, "Invalid or duplicate transcription field")
        parts[name] = part.get_payload(decode=True)
    audio = parts.get("file", b"")
    try:
        language = parts.get("language", b"").decode("ascii").strip()
        if parts.get("response_format", b"verbose_json") != b"verbose_json" or (language and not re.fullmatch("[a-z]{2,3}", language)):
            raise ValueError("invalid language or format")
        with wave.open(io.BytesIO(audio), "rb") as stream:
            frames = stream.getnframes()
            if stream.getnchannels() != 1 or stream.getsampwidth() != 2 or stream.getframerate() != 16000 or not 0 < frames <= 16_000 * 1000:
                raise ValueError("unsupported WAV")
            if len(stream.readframes(frames)) != frames * 2:
                raise ValueError("truncated WAV")
    except (UnicodeError, ValueError, wave.Error, EOFError) as error:
        raise HTTPException(400, "Transcription requires complete 16 kHz mono PCM WAV, at most 1000 seconds") from error
    return audio, language


class SpeechTranscription:
    def __init__(self, receipts, python: Path | None, model: Path | None):
        self.receipts, self.python, self.model = receipts, python, model
        self.lock = asyncio.Lock()

    def available(self) -> bool:
        return bool(self.python and self.python.is_file() and self.model and all((self.model / name).is_file() for name in ("model.bin", "config.json", "tokenizer.json")))

    async def infer(self, request: Request, key: str):
        if not self.available():
            raise HTTPException(503, "Offline Whisper is not configured; set ASR_PYTHON and ASR_MODEL_DIR to existing installations")
        digest = self.receipts.digest(key)
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > MAX_TRANSCRIPTION_BYTES:
                raise HTTPException(413, "Transcription upload exceeds 32 MiB; split the source first")
        audio, language = parse_transcription_form(request.headers.get("content-type", ""), bytes(raw))
        fingerprint = hashlib.sha256(audio + b"\0" + language.encode()).hexdigest()
        async with self.lock:
            previous = self.receipts.read(digest)
            if previous:
                if previous.get("model") != "transcription" or previous.get("fingerprint") != fingerprint:
                    raise HTTPException(409, "Idempotency-Key was used with different transcription inputs")
                if "result" in previous:
                    return previous["result"]
                raise HTTPException(409, "Previous transcription outcome is uncertain; CPU inference was not repeated")
            receipt = {"model": "transcription", "fingerprint": fingerprint, "created_at": time.time(), "status": "submitting"}
            self.receipts.write(digest, receipt)
            with tempfile.TemporaryDirectory(prefix="yingce-transcribe-", dir=self.receipts.directory) as directory:
                source = Path(directory) / "input.wav"
                source.write_bytes(audio)
                environment = {**os.environ, "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "PYTHONUTF8": "1"}
                # The installed audio runtime has its own dependencies. Do not
                # inject the gateway runtime into that interpreter's imports.
                environment.pop("PYTHONPATH", None)
                process = await asyncio.create_subprocess_exec(str(self.python), "-X", "utf8", "-B", str(Path(__file__).with_name("transcribe_local.py")), "--model", str(self.model), "--input", str(source), "--language", language, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=environment)
                pending = asyncio.create_task(process.communicate())
                deadline = time.monotonic() + 1200
                try:
                    while not pending.done():
                        await asyncio.wait({pending}, timeout=0.25)
                        if await request.is_disconnected():
                            raise HTTPException(499, "Transcription caller disconnected")
                        if time.monotonic() > deadline:
                            raise HTTPException(504, "Offline transcription timed out")
                    stdout, _ = await pending
                    if process.returncode != 0:
                        raise HTTPException(502, "Offline Whisper inference failed; verify the installed runtime and model")
                    try:
                        result = json.loads(stdout)
                        if not isinstance(result.get("segments"), list) or not result["segments"] or len(result["segments"]) > 5000:
                            raise ValueError("no speech")
                    except (ValueError, TypeError, AttributeError) as error:
                        raise HTTPException(502, "Offline Whisper did not return usable speech segments") from error
                    receipt["result"] = result
                    self.receipts.write(digest, receipt)
                    return result
                finally:
                    if process.returncode is None:
                        process.kill()
                    await pending
