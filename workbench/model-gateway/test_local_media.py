# SPDX-License-Identifier: AGPL-3.0-or-later
"""Receipt failure contracts. Fixtures below deliberately replace model execution."""
import asyncio
import base64
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from gateway import Receipts
from local_media import LocalMedia, SeparationRequest
from media_separation import CHECKPOINT_SHA256, ROLES, required_disk_bytes, result_roles
from test_local_speech import fixture_wav


def request(stems="pair"):
    return SeparationRequest(reference_audio="data:audio/wav;base64," + base64.b64encode(fixture_wav()).decode(), stems=stems)


class SeparationInputTests(unittest.TestCase):
    def test_urls_unsupported_modes_extra_parameters_and_corrupt_encoding_fail(self):
        for values in [{"reference_audio": "http://localhost/audio.wav"}, {"reference_audio": "data:audio/wav;base64,@@@@"}, {"stems": "vocals-only"}, {"model_name": "download-new-model"}, {"unknown": True}]:
            with self.assertRaises(ValidationError):
                SeparationRequest.model_validate({**request().model_dump(), **values})

    def test_disk_reserve_includes_every_requested_track(self):
        self.assertGreater(required_disk_bytes(600, 5), required_disk_bytes(600, 2))
        self.assertEqual(result_roles("all"), ["vocals", "instrumental", "drums", "bass", "other"])


class MediaReceiptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.receipts = Receipts(self.root)
        self.engine = LocalMedia(self.receipts, None, None, None)
        self.engine.available = lambda: True
        self.starts = []
        self.release = asyncio.Event()
        self.disk = patch("local_media.shutil.disk_usage", return_value=type("Space", (), {"free": 16 * 1024**3})())
        self.disk.start()

        async def substitute_executor(digest, receipt, directory):
            self.starts.append(receipt["prompt_id"])
            await self.release.wait()
        self.engine.execute = substitute_executor

    async def asyncTearDown(self):
        await self.engine.close()
        self.disk.stop()
        self.temporary.cleanup()

    def completed_files(self, identity):
        _, receipt = self.engine.lookup(identity)
        directory = self.engine.directory(identity)
        outputs = []
        for index, role in enumerate(result_roles(receipt["stems"])):
            body = fixture_wav() + bytes([index])
            (directory / (role + ".wav")).write_bytes(body)
            outputs.append({"role": role, "name": ROLES[role], "filename": role + ".wav", "mime_type": "audio/wav", "duration": .1, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
        (directory / "result.json").write_text(json.dumps({"version": 1, "model": "htdemucs", "stems": receipt["stems"], "source_sha256": receipt["source_sha256"], "checkpoint_sha256": CHECKPOINT_SHA256, "shared_gain": 1., "source_duration": .1, "sample_rate":44100, "channels":2, "outputs": outputs}), encoding="utf-8")

    async def test_same_key_and_input_has_one_executor_and_changed_mode_conflicts(self):
        first = await self.engine.submit(request(), "one-operation")
        self.assertEqual(first, await self.engine.submit(request(), "one-operation"))
        await asyncio.sleep(0)
        self.assertEqual(self.starts, [first["prompt_id"]])
        with self.assertRaises(HTTPException) as error:
            await self.engine.submit(request("all"), "one-operation")
        self.assertEqual(error.exception.status_code, 409)

    async def test_replay_needs_no_available_model_and_repairs_secondary_index(self):
        first = await self.engine.submit(request(), "offline-replay")
        self.receipts.prompt_path(first["prompt_id"]).unlink()
        self.engine.available = lambda: False
        self.assertEqual(first, await self.engine.submit(request(), "offline-replay"))
        self.assertIsNotNone(self.engine.lookup(first["prompt_id"]))

    async def test_low_storage_has_no_receipt_no_input_and_no_execution(self):
        with patch("local_media.shutil.disk_usage", return_value=type("Space", (), {"free": 100})()):
            with self.assertRaises(HTTPException) as error:
                await self.engine.submit(request(), "disk-full")
        self.assertEqual(error.exception.status_code, 507)
        self.assertFalse(self.starts)
        self.assertFalse(list(self.root.iterdir()))

    async def test_waiting_work_reserves_storage_before_accepting_more(self):
        reserve = required_disk_bytes(600, 5) + 44 * 1024 * 1024
        with patch("local_media.shutil.disk_usage", return_value=type("Space", (), {"free": reserve + 1})()):
            await self.engine.submit(request("all"), "first")
            with self.assertRaises(HTTPException) as error:
                await self.engine.submit(request("all"), "second")
        self.assertEqual(error.exception.status_code, 507)

    async def test_restarted_pending_task_fails_without_second_inference(self):
        first = await self.engine.submit(request(), "interrupted")
        await self.engine.close()
        restarted = LocalMedia(self.receipts, None, None, None)
        state = await restarted.status(first["prompt_id"])
        self.assertEqual((state["status"], state["reason"]), ("failed", "execution_interrupted"))
        self.assertFalse(restarted.pending)
        self.assertFalse((restarted.directory(first["prompt_id"]) / "input.json").exists())

    async def test_all_finished_tracks_recover_after_lost_terminal_receipt_without_models(self):
        first = await self.engine.submit(request("all"), "finished")
        await self.engine.close()
        self.completed_files(first["prompt_id"])
        restarted = LocalMedia(self.receipts, None, None, None)
        result = await restarted.status(first["prompt_id"])
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual([item["role"] for item in result["outputs"]], result_roles("all"))
        self.assertEqual(len({item["sha256"] for item in result["outputs"]}), 5)
        self.assertFalse(restarted.pending)
        (restarted.directory(first["prompt_id"]) / "other.wav").write_bytes(b"changed")
        with self.assertRaises(HTTPException) as error:
            await restarted.status(first["prompt_id"])
        self.assertEqual(error.exception.status_code, 409)

    async def test_partial_outputs_do_not_become_a_successful_group(self):
        first = await self.engine.submit(request("all"), "partial")
        await self.engine.close()
        self.completed_files(first["prompt_id"])
        (self.engine.directory(first["prompt_id"]) / "bass.wav").unlink()
        restarted = LocalMedia(self.receipts, None, None, None)
        self.assertEqual((await restarted.status(first["prompt_id"]))["status"], "failed")

    async def test_manifest_cannot_hide_lost_interval_or_invalid_gain(self):
        first = await self.engine.submit(request(), "bad-manifest")
        await self.engine.close()
        self.completed_files(first["prompt_id"])
        path = self.engine.directory(first["prompt_id"]) / "result.json"
        original = json.loads(path.read_text(encoding="utf-8"))
        receipt = self.engine.lookup(first["prompt_id"])[1]
        for change in [{"shared_gain": float("nan")}, {"shared_gain": 0}, {"source_duration": .2}, {"sample_rate": 48000}]:
            path.write_text(json.dumps({**original, **change}), encoding="utf-8")
            self.assertFalse(self.engine.completed(path.parent, receipt))

    async def test_cancel_only_one_execution_and_reclaims_uploaded_source(self):
        first = await self.engine.submit(request(), "cancel-one")
        other = await self.engine.submit(request(), "keep-other")
        self.assertEqual((await self.engine.cancel(first["prompt_id"]))["status"], "cancelled")
        self.assertIn(other["prompt_id"], self.engine.pending)
        self.assertFalse((self.engine.directory(first["prompt_id"]) / "input.json").exists())

    async def test_failed_receipt_write_starts_no_inference_and_removes_preparation(self):
        with patch.object(self.receipts, "write", side_effect=HTTPException(507, "full")):
            with self.assertRaises(HTTPException):
                await self.engine.submit(request(), "receipt-full")
        self.assertFalse(self.engine.pending)
        self.assertFalse(list(self.root.glob("media/*/input.json")))

    async def test_foreign_job_paths_and_malformed_manifests_cannot_select_files(self):
        for identity in ["../output.wav", "not-a-uuid"]:
            with self.assertRaises(HTTPException):
                await self.engine.status(identity)
        first = await self.engine.submit(request(), "foreign")
        await self.engine.close()
        self.completed_files(first["prompt_id"])
        result_path = self.engine.directory(first["prompt_id"]) / "result.json"
        result = json.loads(result_path.read_text(encoding="utf-8"))
        result["outputs"][1]["filename"] = "../../outside.wav"
        result_path.write_text(json.dumps(result), encoding="utf-8")
        self.assertFalse(self.engine.completed(result_path.parent, self.engine.lookup(first["prompt_id"])[1]))


if __name__ == "__main__":
    unittest.main()
