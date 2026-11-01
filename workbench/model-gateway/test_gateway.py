# SPDX-License-Identifier: AGPL-3.0-or-later
import json
import hashlib
import base64
import io
import re
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import HTTPException
from PIL import Image

from gateway import GenerateRequest, InferenceTransport, Receipts, Settings
from reference_images import decode_reference


class GatewayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        workflow = {"1": {"class_type": "SaveImage", "inputs": {"filename_prefix": "old", "text": "__PROMPT__", "seed": "__SEED__", "width": "__WIDTH__", "frames": "__FRAMES__"}}}
        for name in ("flux2_klein_api.json", "wan22_ti2v_api.json"):
            (self.directory / name).write_text(json.dumps(workflow), encoding="utf-8")
        self.requests = []
        self.prompt_id = "4a338ab1-3318-4fbb-bd85-94b53e957376"
        self.extra = {}
        self.fail_receipt = False
        self.history = {}
        self.weights_available = True
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.handle))
        settings = Settings(receipt_dir=self.directory / "receipts", workflow_dir=self.directory)
        self.transport = InferenceTransport(settings, self.client)

    async def asyncTearDown(self):
        await self.client.aclose()
        self.temporary.cleanup()

    async def test_structured_vision_passes_actual_schema_and_does_not_repeat_inference(self):
        schema = {"type": "object", "properties": {"canPlan": {"type": "boolean"}}, "required": ["canPlan"]}
        request = GenerateRequest(model="text", prompt="describe", reference_images=[self.reference()], response_format=schema)
        first = await self.transport.text(request, "structured-native-planning")
        second = await self.transport.text(request, "structured-native-planning")
        self.assertEqual(first, second)
        calls = [item for item in self.requests if item.url.path == "/api/chat"]
        self.assertEqual(len(calls), 1)
        body = json.loads(calls[0].content)
        self.assertEqual(body["format"], schema)
        self.assertEqual(body["options"]["temperature"], 0)
        self.assertTrue(body["messages"][-1]["images"])
        with self.assertRaises(HTTPException) as changed:
            await self.transport.text(request.model_copy(update={"response_format": {"type": "string"}}), "structured-native-planning")
        self.assertEqual(changed.exception.status_code, 409)

    def test_optional_format_preserves_existing_receipt_fingerprints(self):
        for model in ("text", "image", "video"):
            request = GenerateRequest(model=model, prompt="original")
            legacy = request.model_dump()
            legacy.pop("response_format")
            legacy.pop("music")
            expected = hashlib.sha256(json.dumps(legacy, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(request.receipt_fingerprint(), expected)

    def test_structured_format_rejects_non_text_thinking_oversize_and_references(self):
        for extra in ({"model": "image", "response_format": {}}, {"model": "text", "think": True, "response_format": {}}, {"model": "text", "response_format": {"description": "x" * 12001}}, {"model": "text", "response_format": {"$ref": "https://example.invalid/schema"}}):
            with self.assertRaises(ValueError):
                GenerateRequest(**extra)

    def handle(self, request):
        self.requests.append(request)
        path = request.url.path
        if path == "/queue":
            queue = [[1, self.prompt_id, {}, self.extra]] if self.extra else []
            return httpx.Response(200, json={"queue_running": queue, "queue_pending": []})
        if path.startswith("/history"):
            return httpx.Response(200, json=self.history)
        if path == "/prompt":
            payload = json.loads(request.content)
            self.extra = payload["extra_data"]
            if self.fail_receipt:
                raise httpx.ReadTimeout("lost response", request=request)
            return httpx.Response(200, json={"prompt_id": self.prompt_id})
        if path == "/upload/image":
            name = re.search(rb'filename="([a-f0-9]{64}\.png)"', request.content).group(1).decode()
            return httpx.Response(200, json={"name": name, "subfolder": "yingce-reference", "type": "input"})
        if path == "/view":
            return httpx.Response(200, content=b"saved-artifact", headers={"Content-Type": "video/mp4"})
        if path == "/api/chat":
            return httpx.Response(200, json={"message": {"content": "测试对白"}, "prompt_eval_count": 10, "eval_count": 4})
        if path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3.5:9b"}]})
        if path.startswith("/object_info/"):
            loader = path.split("/")[-1]
            from local_music import MUSIC_NODES, MUSIC_WEIGHTS
            if loader in MUSIC_NODES and loader not in {"UNETLoader", "VAELoader"}:
                required = {field: [[weight] if self.weights_available else []] for field, weight in MUSIC_WEIGHTS.get(loader, {}).items()}
                return httpx.Response(200, json={loader: {"input": {"required": required}}})
            field, names = {"UNETLoader": ("unet_name", ["flux-2-klein-4b-fp8.safetensors", "wan2.2_ti2v_5B_fp16.safetensors"]), "CLIPLoader": ("clip_name", ["qwen_3_4b.safetensors", "umt5_xxl_fp8_e4m3fn_scaled.safetensors"]), "VAELoader": ("vae_name", ["flux2-vae.safetensors", "wan2.2_vae.safetensors"])}[loader]
            names += list(MUSIC_WEIGHTS.get(loader, {}).values())
            return httpx.Response(200, json={loader: {"input": {"required": {field: [names if self.weights_available else []]}}}})
        if path == "/free":
            return httpx.Response(200, content=b"")
        return httpx.Response(200, json={})

    async def test_duplicate_submission_reuses_upstream_receipt(self):
        request = GenerateRequest(model="image", prompt="a cat", seed=12)
        first = await self.transport.submit(request, "native-task-1")
        # Recoverability survives a transport process restart.
        restarted = InferenceTransport(self.transport.settings, self.client)
        second = await restarted.submit(request, "native-task-1")
        self.assertEqual(first["prompt_id"], second["prompt_id"])
        self.assertTrue(second["reused"])
        self.assertEqual(sum(r.url.path == "/prompt" for r in self.requests), 1)

    async def test_music_uses_original_lyrics_and_recovers_lost_submission_without_repeat(self):
        request = GenerateRequest(model="audio", model_name="acestep-1.5-turbo", prompt="gentle folk guitar", music={"mode": "song", "lyrics": "[Verse]\n晚风吹过山坡", "seconds": 20, "bpm": 86, "language": "zh"}, seed=66)
        self.fail_receipt = True
        with self.assertRaises(HTTPException):
            await self.transport.submit(request, "native-song-66")
        restarted = InferenceTransport(self.transport.settings, self.client)
        recovered = await restarted.submit(request, "native-song-66")
        self.assertTrue(recovered["reused"])
        calls = [r for r in self.requests if r.url.path == "/prompt"]
        self.assertEqual(len(calls), 1)
        graph = json.loads(calls[0].content)["prompt"]
        self.assertEqual(graph["4"]["inputs"]["lyrics"], request.music.lyrics)
        self.assertEqual(graph["4"]["inputs"]["bpm"], 86)
        self.assertEqual(graph["6"]["inputs"]["seconds"], 20)
        self.assertEqual(graph["8"]["inputs"]["seed"], 66)
        with self.assertRaises(HTTPException) as changed:
            await restarted.submit(request.model_copy(update={"prompt": "different style"}), "native-song-66")
        self.assertEqual(changed.exception.status_code, 409)

    async def test_music_collects_actual_saved_audio_and_preserves_filename(self):
        self.history[self.prompt_id] = {"status": {"completed": True}, "outputs": {"10": {"audio": [{"filename": "actual.flac", "subfolder": "yingce", "type": "output"}]}}}
        state = await self.transport.status(self.prompt_id)
        self.assertEqual(state["status"], "succeeded")
        self.assertEqual(state["outputs"][0]["filename"], "actual.flac")
        self.assertEqual(parse_qs(state["outputs"][0]["_comfy_query"])["filename"], ["actual.flac"])

    def test_music_rejects_unsupported_and_inconsistent_inputs_before_submission(self):
        changes = [{}, {"music": {"mode": "song"}}, {"music": {"mode": "instrumental", "lyrics": "secret song"}}, {"music": {"seconds": 31}}, {"music": {"seconds": 9}}, {"music": {"bpm": 241}}, {"music": {"language": "invalid"}}, {"music": {}, "reference_images": [self.reference()]}, {"music": {}, "think": True}, {"music": {}, "model": "image"}]
        for change in changes:
            with self.assertRaises(ValueError, msg=str(change)):
                GenerateRequest(**{"model": "audio", "prompt": "style", **change})
        self.assertEqual(self.requests, [])

    def test_instrumental_graph_is_one_output_without_spoken_style_or_lyrics(self):
        request = GenerateRequest(model="audio", prompt="warm piano", music={}, seed=33)
        graph = self.transport.workflow(request, "a" * 64)
        self.assertEqual(graph["4"]["inputs"]["lyrics"], "[Instrumental]")
        self.assertEqual(graph["4"]["inputs"]["tags"], "instrumental, no vocals, warm piano")
        self.assertEqual(graph["10"]["inputs"]["filename_prefix"], "yingce/" + "a" * 24)

    async def test_changed_inputs_do_not_reuse_or_create(self):
        await self.transport.submit(GenerateRequest(model="image", prompt="cat"), "native-task-2")
        with self.assertRaises(HTTPException) as result:
            await self.transport.submit(GenerateRequest(model="image", prompt="dog"), "native-task-2")
        self.assertEqual(result.exception.status_code, 409)
        self.assertEqual(sum(r.url.path == "/prompt" for r in self.requests), 1)

    async def test_lost_create_response_recovers_without_resubmission(self):
        self.fail_receipt = True
        request = GenerateRequest(model="image", prompt="cat")
        with self.assertRaises(HTTPException):
            await self.transport.submit(request, "native-task-3")
        recovered = await self.transport.submit(request, "native-task-3")
        self.assertEqual(recovered["prompt_id"], self.prompt_id)
        self.assertEqual(sum(r.url.path == "/prompt" for r in self.requests), 1)

    async def test_unknown_receipt_is_not_resubmitted(self):
        request = GenerateRequest(model="image", prompt="cat")
        await self.transport.submit(request, "native-task-4")
        digest = Receipts.digest("native-task-4")
        receipt = self.transport.receipts.read(digest)
        del receipt["prompt_id"]
        self.transport.receipts.write(digest, receipt)
        self.extra = {}
        with self.assertRaises(HTTPException) as result:
            await self.transport.submit(request, "native-task-4")
        self.assertEqual(result.exception.status_code, 409)
        self.assertEqual(sum(r.url.path == "/prompt" for r in self.requests), 1)

    async def test_invalid_dimensions_and_frames_never_touch_gpu(self):
        for request in (GenerateRequest(model="image", prompt="cat", width=129), GenerateRequest(model="video", prompt="cat", frames=24)):
            with self.assertRaises(HTTPException):
                await self.transport.submit(request, "invalid-test")
        self.assertEqual(self.requests, [])

    async def test_wrong_model_never_silently_runs_another_model(self):
        with self.assertRaises(HTTPException) as result:
            await self.transport.submit(GenerateRequest(model="image", model_name="some-other-model", prompt="cat"), "wrong-model")
        self.assertEqual(result.exception.status_code, 400)
        self.assertEqual(self.requests, [])

    async def test_output_filename_is_url_encoded(self):
        self.history = {self.prompt_id: {"status": {"completed": True}, "outputs": {"58": {"videos": [{"filename": "猫 & 狗.mp4", "subfolder": "yingce", "type": "output"}]}}}}
        result = await self.transport.status(self.prompt_id)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(parse_qs(result["outputs"][0]["_comfy_query"])["filename"], ["猫 & 狗.mp4"])
        self.assertEqual(result["outputs"][0]["url"], f"/api/jobs/{self.prompt_id}/outputs/0")
        artifact = await self.transport.artifact(self.prompt_id, 0)
        content = b"".join([chunk async for chunk in artifact.body_iterator])
        self.assertEqual(content, b"saved-artifact")
        self.assertEqual(parse_qs(self.requests[-1].url.query.decode())["filename"], ["猫 & 狗.mp4"])

    async def test_missing_execution_receipt_ends_polling_without_resubmission(self):
        state = await self.transport.status(self.prompt_id)
        self.assertEqual(state["status"], "failed")
        self.assertIn("no inference was automatically repeated", state["message"])
        self.assertEqual([request.url.path for request in self.requests], ["/history/" + self.prompt_id, "/queue"])

    async def test_running_receipt_remains_processing_even_without_history(self):
        self.extra = {"yingce_request": "owned-native-task"}
        self.assertEqual((await self.transport.status(self.prompt_id))["status"], "processing")
        self.assertFalse(any(request.url.path == "/prompt" for request in self.requests))

    def reference(self):
        stream = io.BytesIO()
        Image.new("RGB", (16, 16), "red").save(stream, format="PNG")
        return "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode()

    async def test_reference_reaches_both_real_workflow_types(self):
        from dataclasses import replace
        self.transport.settings = replace(self.transport.settings, workflow_dir=Path(__file__).parent / "workflows")
        for mode in ("image", "video"):
            self.extra = {}
            await self.transport.submit(GenerateRequest(model=mode, prompt="preserve subject", reference_images=[self.reference()]), "reference-" + mode)
            prompt = json.loads(next(request.content for request in reversed(self.requests) if request.url.path == "/prompt"))["prompt"]
            self.assertTrue(prompt["yingce-reference"]["inputs"]["image"].startswith("yingce-reference/"))
            if mode == "video":
                self.assertEqual(prompt["55"]["inputs"]["start_image"], ["yingce-reference", 0])
            else:
                self.assertEqual(prompt["70"]["inputs"]["positive"], ["yingce-reference-positive", 0])
                self.assertEqual(prompt["70"]["inputs"]["negative"], ["yingce-reference-negative", 0])
            receipt = self.transport.receipts.read(Receipts.digest("reference-" + mode))
            self.assertEqual(receipt["reference_sha256"], [decode_reference(self.reference()).digest])
            self.assertNotIn("base64", json.dumps(receipt))

    async def test_invalid_reference_is_rejected_before_upload_or_gpu(self):
        for value in ("https://example.invalid/image.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,bm90IGFuIGltYWdl", "data:image/png;base64,%%%%"):
            with self.assertRaises(HTTPException):
                await self.transport.submit(GenerateRequest(model="image", prompt="cat", reference_images=[value]), "bad-reference")
        self.assertEqual(self.requests, [])

    async def test_visual_text_uses_validated_pixel_bytes(self):
        await self.transport.text(GenerateRequest(model="text", prompt="describe", reference_images=[self.reference()]), "visual-text")
        payload = json.loads(next(request.content for request in self.requests if request.url.path == "/api/chat"))
        self.assertEqual(payload["messages"][-1]["images"], [decode_reference(self.reference()).base64()])

    async def test_context_overflow_is_rejected_before_inference(self):
        for request in (GenerateRequest(model="text", prompt="字" * 3000), GenerateRequest(model="text", prompt="cat", max_tokens=8192)):
            with self.assertRaises(HTTPException) as result:
                await self.transport.text(request, "context-limit")
            self.assertEqual(result.exception.status_code, 400)
        self.assertEqual(self.requests, [])

    async def test_model_inventory_checks_weights_instead_of_service_health(self):
        from dataclasses import replace
        self.transport.settings = replace(self.transport.settings, workflow_dir=Path(__file__).parent / "workflows")
        inventory = await self.transport.model_inventory()
        self.assertTrue(all(item["available"] for item in inventory["models"]))
        self.weights_available = False
        inventory = await self.transport.model_inventory()
        self.assertTrue(inventory["models"][0]["available"])
        self.assertFalse(inventory["models"][1]["available"])
        self.assertIn("flux2-vae.safetensors", inventory["models"][1]["missing_weights"])

    async def test_text_reuses_result_and_reports_usage(self):
        request = GenerateRequest(model="text", prompt="对白")
        first = await self.transport.text(request, "native-text-1")
        second = await self.transport.text(request, "native-text-1")
        self.assertEqual(first, second)
        self.assertEqual(first["usage"]["total_tokens"], 14)
        self.assertEqual(sum(r.url.path == "/api/chat" for r in self.requests), 1)

    async def test_corrupt_receipt_blocks_submission(self):
        digest = Receipts.digest("corrupt-test")
        (self.transport.receipts.directory / (digest + ".json")).write_text("{bad", encoding="utf-8")
        with self.assertRaises(HTTPException) as result:
            await self.transport.submit(GenerateRequest(model="image", prompt="cat"), "corrupt-test")
        self.assertEqual(result.exception.status_code, 503)
        self.assertEqual(self.requests, [])


if __name__ == "__main__":
    unittest.main()
