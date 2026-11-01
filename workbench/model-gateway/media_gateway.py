# SPDX-License-Identifier: AGPL-3.0-or-later
"""Optional local compute transport; native Yingce owns projects, jobs and assets."""
from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse

from gateway import Receipts
from local_media import LocalMedia, SeparationRequest
from local_lip_sync import LocalLipSync
from lip_sync_contract import LipSyncRequest


def create_media_app(directory=None, python=None, model=None, ffmpeg=None, lip_sync_model=None):
    def configured(name):
        value = os.getenv(name)
        return Path(value) if value else None

    directory = directory or Path(os.getenv("MODEL_RECEIPT_DIR", ".local/media-gateway-receipts"))
    python, model, ffmpeg = python or configured("MEDIA_PYTHON"), model or configured("MEDIA_MODEL"), ffmpeg or configured("MEDIA_FFMPEG")
    lip_sync_model = lip_sync_model or configured("LIP_SYNC_MODEL_DIR")

    @asynccontextmanager
    async def lifespan(app):
        app.state.media = LocalMedia(Receipts(directory), python, model, ffmpeg)
        app.state.lip_sync = LocalLipSync(app.state.media.receipts, python, lip_sync_model, ffmpeg)
        lease = __import__('asyncio').Lock()
        app.state.media.cpu_lock = app.state.lip_sync.cpu_lock = lease
        app.state.media.storage_peers = [app.state.lip_sync]
        app.state.lip_sync.storage_peers = [app.state.media]
        await app.state.media.verify_runtime()
        await app.state.lip_sync.verify_runtime()
        try:
            yield
        finally:
            await app.state.media.close()
            await app.state.lip_sync.close()

    app = FastAPI(title="影策本地声音工具传输", lifespan=lifespan)

    @app.get("/api/health")
    async def health():
        return {"media": app.state.media.available(), "lip_sync": app.state.lip_sync.available(), "targeted_cancel": True}

    @app.get("/api/models")
    async def models():
        return {"models": [{"model": "audio", "name": "htdemucs", "operation": "separate", "available": app.state.media.available(), "max_source_bytes": 32 * 1024 * 1024, "duration_seconds": [.1, 600], "stems": ["pair", "all"], "formats": ["wav"]},{"model":"video","name":"musetalk-1.5","operation":"lip_sync","available":app.state.lip_sync.available(),"duration_seconds":[.1,30],"max_source_video_bytes":24*1024*1024,"max_source_image_or_audio_bytes":8*1024*1024,"formats":["mp4"],"output_policy":"selected-interval-new-candidate","device":"cpu"}]}

    @app.post("/api/media/separate")
    async def submit(body: SeparationRequest, idempotency_key: str = Header(default="")):
        return await app.state.media.submit(body, idempotency_key)

    @app.post("/api/media/lip-sync")
    async def lip_sync(body:LipSyncRequest,idempotency_key:str=Header(default="")):
        return await app.state.lip_sync.submit(body,idempotency_key)

    def engine(identity):
        app.state.media.directory(identity)
        stored=app.state.media.receipts.for_prompt(identity)
        if not stored:raise HTTPException(404,"Media receipt not found")
        if stored[1].get("model")=="lip_sync":return app.state.lip_sync
        if stored[1].get("model")=="media":return app.state.media
        raise HTTPException(404,"Media receipt type is not supported")

    @app.get("/api/jobs/{identity}")
    async def status(identity: str):
        return await engine(identity).status(identity)

    @app.get("/api/jobs/{identity}/outputs/{index}")
    async def output(identity: str, index: int):
        selected=engine(identity)
        current = await selected.status(identity)
        if current["status"] != "succeeded" or not 0 <= index < len(current["outputs"]):
            raise HTTPException(409, "The requested separated track is not ready")
        item = current["outputs"][index]
        return FileResponse(selected.directory(identity) / item["filename"], media_type=item.get("mime_type","audio/wav"), filename=item["filename"])

    @app.post("/api/jobs/{identity}/cancel")
    async def cancel(identity: str):
        return await engine(identity).cancel(identity)

    @app.get("/api/receipts/{digest}")
    async def receipt(digest: str):
        stored = app.state.media.receipts.read(digest)
        if not stored or stored.get("model") not in {"media","lip_sync"}:
            raise HTTPException(404, "Media receipt not found")
        app.state.media.receipts.write(digest, stored)
        state = await engine(stored["prompt_id"]).status(stored["prompt_id"])
        return {"prompt_id": stored["prompt_id"], "status": state["status"]}

    return app


app = create_media_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("MODEL_GATEWAY_PORT", "8005")))
