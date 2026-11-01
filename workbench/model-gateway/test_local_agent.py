# SPDX-License-Identifier: AGPL-3.0-or-later
import json
import copy
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException
from gateway import InferenceTransport, Settings
from local_agent import AgentRequest, infer_agent, prepare


TOOL = {"type": "function", "function": {"name": "inspect_project", "description": "Read the current project", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}}


class LocalAgentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.calls = []
        self.failure = None
        self.payload = {"done": True, "done_reason": "stop", "message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": "inspect_project", "arguments": {}}}]}, "prompt_eval_count": 20, "eval_count": 5}
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.handle))
        self.transport = InferenceTransport(Settings(receipt_dir=Path(self.temp.name)), self.client)

    async def asyncTearDown(self):
        await self.client.aclose()
        self.temp.cleanup()

    def handle(self, request):
        self.calls.append(request)
        if request.url.path == "/queue": return httpx.Response(200, json={"queue_running": [], "queue_pending": []})
        if request.url.path == "/free": return httpx.Response(200)
        if self.failure: raise self.failure
        return httpx.Response(200, json=self.payload)

    def request(self, **changes):
        return AgentRequest(model_name="qwen3.5:9b", messages=[{"role": "user", "content": "Inspect my project"}], tools=[copy.deepcopy(TOOL)], **changes)

    async def test_tool_only_output_and_usage_survive_restart_without_resubmission(self):
        request = self.request(think=True)
        result = await infer_agent(self.transport, request, "step-1")
        restored = InferenceTransport(self.transport.settings, self.client)
        self.assertEqual(result, await infer_agent(restored, request, "step-1"))
        self.assertEqual(result["usage"]["total_tokens"], 25)
        call = result["message"]["tool_calls"][0]
        self.assertTrue(call["id"].startswith("call_"))
        self.assertEqual(call["function"]["arguments"], {})
        self.assertEqual(sum(r.url.path == "/api/chat" for r in self.calls), 1)
        sent = json.loads(self.calls[-1].content)
        self.assertTrue(sent["think"])
        self.assertEqual(sent["keep_alive"], 0)

    async def test_tool_results_map_identity_to_ollama_name_and_final_answer(self):
        request = self.request()
        first = await infer_agent(self.transport, request, "step-2")
        request.messages += [first["message"], {"role": "tool", "tool_call_id": first["message"]["tool_calls"][0]["id"], "content": "{\"title\":\"Test\"}"}]
        # The canonical host does not pass provider reasoning fields back.
        request.messages[1].pop("thinking")
        self.payload["message"] = {"role": "assistant", "content": "项目名称为 Test。"}
        final = await infer_agent(self.transport, request, "step-3")
        sent = json.loads(self.calls[-1].content)
        self.assertEqual(sent["messages"][-1]["tool_name"], "inspect_project")
        self.assertNotIn("tool_call_id", sent["messages"][-1])
        self.assertEqual(final["message"]["content"], "项目名称为 Test。")

    async def test_lost_response_is_never_resubmitted(self):
        self.failure = httpx.ReadTimeout("lost response")
        for expected in (502, 409):
            with self.assertRaises(HTTPException) as error: await infer_agent(self.transport, self.request(), "lost-step")
            self.assertEqual(error.exception.status_code, expected)
        self.assertEqual(sum(r.url.path == "/api/chat" for r in self.calls), 1)

    async def test_saved_provider_response_recovers_after_result_write_failure(self):
        original = self.transport.receipts.write
        def fail_final(digest, receipt):
            if receipt.get("result"): raise HTTPException(507,"simulated final write failure")
            return original(digest,receipt)
        self.transport.receipts.write = fail_final
        with self.assertRaises(HTTPException) as error: await infer_agent(self.transport,self.request(),"saved-raw")
        self.assertEqual(error.exception.status_code,507)
        restored = InferenceTransport(self.transport.settings,self.client)
        result = await infer_agent(restored,self.request(),"saved-raw")
        self.assertEqual(result["message"]["tool_calls"][0]["function"]["name"],"inspect_project")
        self.assertEqual(sum(r.url.path == "/api/chat" for r in self.calls),1)

    async def test_changed_input_cannot_reuse_an_earlier_receipt(self):
        await infer_agent(self.transport, self.request(), "same-step")
        with self.assertRaises(HTTPException) as error:
            await infer_agent(self.transport, self.request(think=True), "same-step")
        self.assertEqual(error.exception.status_code, 409)

    async def test_invalid_history_and_unsupported_selection_never_touch_gpu(self):
        invalid = [
            [{"role": "tool", "tool_call_id": "unknown", "content": "x"}],
            [{"role": "assistant", "tool_calls": [{"id": "x", "function": {"name": "inspect_project", "arguments": "{}"}}]}],
            [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "http://127.0.0.1/private.png"}}]}],
        ]
        for messages in invalid:
            request = self.request()
            request.messages = messages
            with self.assertRaises(HTTPException): await infer_agent(self.transport, request, "invalid")
        with self.assertRaises(HTTPException): await infer_agent(self.transport, self.request(tool_choice="required"), "invalid")
        self.assertEqual(self.calls, [])

    async def test_full_schema_is_counted_before_submission(self):
        request = self.request()
        request.tools[0]["function"]["description"] = "a" * 9000
        with self.assertRaises(HTTPException) as error: await infer_agent(self.transport, request, "oversized")
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.calls, [])

    async def test_truncated_unknown_empty_and_malformed_calls_never_reach_tools(self):
        for index, payload in enumerate([
            {"done": False, "message": {"content": "partial"}},
            {"done": True, "done_reason": "length", "message": {"content": "partial"}},
            {"done": True, "message": {"content": ""}},
            {"done": True, "message": {"tool_calls": [{"function": {"name": "delete_project", "arguments": {}}}]}},
            {"done": True, "message": {"tool_calls": [{"function": {"name": "inspect_project", "arguments": "{}"}}]}},
        ]):
            self.payload = payload
            with self.assertRaises(HTTPException) as error: await infer_agent(self.transport, self.request(), f"invalid-output-{index}")
            self.assertEqual(error.exception.status_code, 502)


if __name__ == "__main__": unittest.main()
