import asyncio
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException

from gateway import InferenceTransport, Settings
from job_cancellation import cancel_job


class ScopedCancellationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.prompt = "510bce55-076a-4c32-a765-f6ff2ebbf803"
        self.other = "a012c949-076a-4c32-a765-f6ff2ebbf803"
        self.digest = "f" * 64
        self.running, self.pending, self.history, self.writes = [], [], {}, []
        self.fail_interrupt = False
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.handle))
        self.settings = Settings(receipt_dir=Path(self.directory.name), targeted_cancel=True)
        self.transport = InferenceTransport(self.settings, self.client)
        self.transport.receipts.write(self.digest, {"model": "video", "prompt_id": self.prompt, "fingerprint": "original-input"})

    async def asyncTearDown(self):
        await self.client.aclose()
        self.directory.cleanup()

    def queued(self, prompt):
        return [1, prompt, {}, {"yingce_request": self.digest} if prompt == self.prompt else {}, []]

    def handle(self, request):
        route = request.url.path
        if request.method == "POST":
            body = json.loads(request.content)
            self.writes.append((route, body))
            if route == "/queue":
                self.assertEqual(body, {"delete": [self.prompt]})
                self.pending = [row for row in self.pending if row[1] != self.prompt]
            elif route == "/interrupt":
                self.assertEqual(body, {"prompt_id": self.prompt})
                if self.fail_interrupt:
                    raise httpx.ReadTimeout("lost scoped cancellation response", request=request)
                matching = [row for row in self.running if row[1] == self.prompt]
                self.running = [row for row in self.running if row[1] != self.prompt]
                if matching:
                    self.history[self.prompt] = {"prompt": matching[0], "status": {"status_str": "error", "completed": False, "messages": [["execution_interrupted", {"prompt_id": self.prompt}]]}}
            else:
                raise AssertionError("Unexpected upstream mutation: " + route)
            # ComfyUI acknowledges these mutations with HTTP200 + empty body.
            return httpx.Response(200, content=b"")
        if route == "/queue":
            return httpx.Response(200, json={"queue_running": self.running, "queue_pending": self.pending})
        if route == "/history/" + self.prompt:
            return httpx.Response(200, json=self.history)
        if route == "/history/" + self.other:
            return httpx.Response(200, json={})
        raise AssertionError("Unexpected upstream read: " + route)

    async def test_running_cancel_preserves_other_clients_and_survives_restart(self):
        self.running = [self.queued(self.prompt)]
        self.pending = [self.queued(self.other)]
        result = await cancel_job(self.transport, self.prompt)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(self.pending[0][1], self.other)
        self.assertEqual(self.transport.receipts.read(self.digest)["cancel_state"], "interrupted")
        self.history = {}  # Simulated ComfyUI history loss, not a real deletion.
        restarted = InferenceTransport(self.settings, self.client)
        self.assertEqual((await restarted.status(self.prompt))["status"], "cancelled")
        writes = len(self.writes)
        self.assertEqual((await cancel_job(restarted, self.prompt))["status"], "cancelled")
        self.assertEqual(len(self.writes), writes)

    async def test_pending_delete_does_not_interrupt_other_running_prompt(self):
        self.running = [self.queued(self.other)]
        self.pending = [self.queued(self.prompt), self.queued(self.other)]
        result = await cancel_job(self.transport, self.prompt)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(self.running[0][1], self.other)
        self.assertEqual(self.pending[0][1], self.other)

    async def test_foreign_prompt_is_rejected_without_writes(self):
        self.running = [self.queued(self.other)]
        with self.assertRaises(HTTPException) as failure:
            await cancel_job(self.transport, self.other)
        self.assertEqual(failure.exception.status_code, 404)
        self.assertEqual(self.writes, [])

    async def test_completed_result_wins_before_cancel_and_original_outputs_remain(self):
        self.history[self.prompt] = {"status": {"completed": True, "status_str": "success"}, "outputs": {"node": {"videos": [{"filename": "original.mp4"}]}}}
        result = await cancel_job(self.transport, self.prompt)
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(self.writes, [])
        self.assertEqual(self.history[self.prompt]["outputs"]["node"]["videos"][0]["filename"], "original.mp4")

    async def test_missing_history_is_not_confirmed_cancellation(self):
        with self.assertRaises(HTTPException) as failure:
            await cancel_job(self.transport, self.prompt)
        self.assertEqual(failure.exception.status_code, 409)
        self.assertEqual(self.writes, [])

    async def test_lost_interrupt_response_can_be_reconciled_without_new_inference(self):
        self.running = [self.queued(self.prompt)]
        self.fail_interrupt = True
        with self.assertRaises(HTTPException):
            await cancel_job(self.transport, self.prompt)
        self.assertIsNotNone(self.transport.receipts.read(self.digest).get("cancel_requested_at"))
        self.fail_interrupt = False
        restarted = InferenceTransport(self.settings, self.client)
        self.assertEqual((await cancel_job(restarted, self.prompt))["status"], "cancelled")
        self.assertTrue(all(route in {"/queue", "/interrupt"} for route, _ in self.writes))

    async def test_response_lost_submission_repairs_index_using_original_metadata(self):
        self.transport.receipts.prompt_path(self.prompt).unlink()
        receipt = self.transport.receipts.read(self.digest)
        del receipt["prompt_id"]
        self.transport.receipts.write(self.digest, receipt)
        self.running = [self.queued(self.prompt)]
        result = await cancel_job(self.transport, self.prompt)
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(self.transport.receipts.for_prompt(self.prompt)[0], self.digest)

    async def test_running_interrupt_requires_verified_version_opt_in(self):
        self.running = [self.queued(self.prompt)]
        transport = InferenceTransport(Settings(receipt_dir=Path(self.directory.name)), self.client)
        with self.assertRaises(HTTPException) as failure:
            await cancel_job(transport, self.prompt)
        self.assertEqual(failure.exception.status_code, 409)
        self.assertEqual(self.writes, [])

    async def test_unrelated_failure_is_not_falsely_classified_as_interrupted(self):
        receipt = self.transport.receipts.read(self.digest)
        receipt["cancel_requested_at"] = 1
        self.transport.receipts.write(self.digest, receipt)
        self.history[self.prompt] = {"status": {"completed": False, "status_str": "error", "messages": [["execution_error", {"prompt_id": self.prompt}]]}}
        self.assertEqual((await self.transport.status(self.prompt))["status"], "failed")

    async def test_duplicate_cancel_requests_are_serialized_and_idempotent(self):
        self.running = [self.queued(self.prompt)]
        results = await asyncio.gather(cancel_job(self.transport, self.prompt), cancel_job(self.transport, self.prompt))
        self.assertTrue(all(row["status"] == "cancelled" for row in results))
        self.assertEqual(sum(route == "/interrupt" for route, _ in self.writes), 1)


if __name__ == "__main__":
    unittest.main()
