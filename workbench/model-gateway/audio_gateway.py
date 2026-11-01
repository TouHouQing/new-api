# SPDX-License-Identifier: AGPL-3.0-or-later
"""Optional host speech transport; shares Yingce's native core protocol."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse

from gateway import Receipts
from local_speech import FORMATS, LANGUAGES, LocalSpeech, SpeechRequest


def create_audio_app(directory=None, python=None, model=None, ffmpeg=None):
    def configured(name):
        value = os.getenv(name)
        return Path(value) if value else None

    directory = directory or Path(os.getenv("MODEL_RECEIPT_DIR", ".local/audio-gateway-receipts"))
    python, model, ffmpeg = python or configured("SPEECH_PYTHON"), model or configured("SPEECH_MODEL_DIR"), ffmpeg or configured("SPEECH_FFMPEG")

    @asynccontextmanager
    async def lifespan(app):
        app.state.speech = LocalSpeech(Receipts(directory), python, model, ffmpeg)
        await app.state.speech.verify_runtime()
        try:
            yield
        finally:
            await app.state.speech.close()

    app = FastAPI(title="影策本地配音传输", lifespan=lifespan)

    @app.get("/api/health")
    async def health():
        return {"speech": app.state.speech.available(), "targeted_cancel": True}

    @app.get("/api/models")
    async def models():
        return {"models": [{"model": "audio", "name": "chatterbox-multilingual", "available": app.state.speech.available(), "languages": sorted(LANGUAGES), "formats": list(FORMATS), "max_prompt_chars": 3000, "max_voice_references": 1, "voice_rights_required": True, "reference_seconds": [3, 20], "speed": [0.5, 2], "streaming": False}]}

    @app.post("/api/audio/submit")
    async def submit(body: SpeechRequest, idempotency_key: str = Header(default="")):
        return await app.state.speech.submit(body, idempotency_key)

    @app.get("/api/jobs/{identity}")
    async def status(identity: str):
        return await app.state.speech.status(identity)

    @app.get("/api/jobs/{identity}/outputs/{index}")
    async def output(identity: str, index: int):
        current = await app.state.speech.status(identity)
        if index != 0 or current["status"] != "succeeded":
            raise HTTPException(409, "The requested speech output is not ready")
        _, receipt = app.state.speech.lookup(identity)
        return FileResponse(app.state.speech.directory(identity) / ("output." + receipt["format"]), media_type=FORMATS[receipt["format"]], filename="speech." + receipt["format"])

    @app.post("/api/jobs/{identity}/cancel")
    async def cancel(identity: str):
        return await app.state.speech.cancel(identity)

    @app.get("/api/receipts/{digest}")
    async def receipt(digest: str):
        stored = app.state.speech.receipts.read(digest)
        if not stored or stored.get("model") != "audio":
            raise HTTPException(404, "Speech receipt not found")
        app.state.speech.receipts.write(digest, stored)
        state = await app.state.speech.status(stored["prompt_id"])
        return {"prompt_id": stored["prompt_id"], "status": state["status"]}

    return app


app = create_audio_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("MODEL_GATEWAY_PORT", "8002")))
