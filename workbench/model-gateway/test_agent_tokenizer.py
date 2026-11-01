import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi import HTTPException
from tokenizers import Tokenizer, models
from agent_tokenizer import AgentTokenizer
from local_agent import AgentRequest, prepare
from gateway import InferenceTransport, Settings, GenerateRequest, create_app
from local_agent import infer_agent
from verify_tokenizer import verify_vocabulary


class AgentTokenizerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        # A tiny fixture tests the verified-file contract; it is not a Qwen count.
        data = Tokenizer(models.WordLevel({"[UNK]": 0}, unk_token="[UNK]")).to_str().encode()
        (self.directory / "tokenizer.json").write_bytes(data)
        self.receipt = {"model": "test-model", "installedModelDigest": "test-digest", "installedModelVocabularyMatched": True, "tokenizerSHA256": hashlib.sha256(data).hexdigest()}
        self.write_receipt()

    def write_receipt(self):
        (self.directory / "verification.json").write_text(json.dumps(self.receipt))

    async def asyncTearDown(self): self.temp.cleanup()

    async def test_corrupt_file_and_wrong_identity_are_rejected(self):
        with self.assertRaises(RuntimeError): AgentTokenizer(self.directory, "wrong-model")
        (self.directory / "tokenizer.json").write_bytes(b"changed")
        with self.assertRaises(RuntimeError): AgentTokenizer(self.directory, "test-model")

    async def test_verification_includes_added_tokens_and_merge_rules(self):
        tokenizer={"model":{"vocab":{"a":0},"merges":[["a","b"]]},"added_tokens":[{"id":1,"content":"<special>"}]}
        installed={"tokenizer.ggml.tokens":["a","<special>"],"tokenizer.ggml.merges":["a b"]}
        self.assertEqual(verify_vocabulary(tokenizer,installed)["addedTokensVerified"],1)
        installed["tokenizer.ggml.tokens"][1]="changed"
        with self.assertRaises(ValueError): verify_vocabulary(tokenizer,installed)
        installed["tokenizer.ggml.tokens"][1]="<special>";installed["tokenizer.ggml.merges"]=["b a"]
        with self.assertRaises(ValueError): verify_vocabulary(tokenizer,installed)

    async def test_changed_installed_model_stops_inference(self):
        tokenizer = AgentTokenizer(self.directory, "test-model")
        for models in [[], [{"name":"test-model","digest":"changed"}]]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200,json={"models":models}))) as client:
                with self.assertRaises(HTTPException) as error: await tokenizer.verify_model(client,"http://ollama")
                self.assertEqual(error.exception.status_code,503)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={"models":[{"name":"test-model","digest":"test-digest"}]}))) as client:
            await tokenizer.verify_model(client,"http://ollama")

    async def test_health_distinguishes_verified_changed_and_unconfigured_agent(self):
        for directory, digest, expected in [(self.directory, "test-digest", True), (self.directory, "changed", False), (None, "test-digest", False)]:
            requests = []
            def handler(request):
                requests.append(request)
                if request.url.path == "/api/tags":
                    return httpx.Response(200, json={"models": [{"name": "test-model", "digest": digest}]})
                return httpx.Response(200, json={})
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as upstream:
                app = create_app(Settings(text_model="test-model", receipt_dir=self.directory / "health-receipts", agent_tokenizer_dir=directory), upstream)
                async with app.router.lifespan_context(app):
                    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://gateway") as api:
                        response = await api.get("/api/health")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["agent_tokenizer_ready"], expected)
                self.assertEqual(response.json()["agent_tokenizer_configured"], directory is not None)
                self.assertTrue(response.json()["ollama"])
                self.assertTrue(all(request.method == "GET" for request in requests))

    async def test_tokenized_admission_preserves_full_history_and_template_reserve(self):
        tokenizer = AgentTokenizer(self.directory,"test-model")
        request = AgentRequest(model_name="test-model",messages=[{"role":"user","content":"中文上下文"*1000}],context_length=8192,max_tokens=512)
        with self.assertRaises(HTTPException): prepare(request)
        messages, _, _, budget = prepare(request, tokenizer)
        self.assertEqual(messages[0]["content"],request.messages[0]["content"])
        self.assertEqual(budget["templateReserve"],4096)
        self.assertEqual(budget["method"],"verified-tokenizer-with-template-reserve")
        self.assertLess(budget["estimatedInputTokens"]+request.max_tokens,request.context_length)

    async def test_unavailable_optional_tokenizer_does_not_disable_media_receipts(self):
        async with httpx.AsyncClient() as client:
            transport=InferenceTransport(Settings(receipt_dir=self.directory/"receipts",agent_tokenizer_dir=self.directory/"missing"),client)
            self.assertTrue(transport.agent_tokenizer_error)
            identity="4a338ab1-3318-4fbb-bd85-94b53e957376"
            transport.receipts.write("a"*64,{"model":"image","prompt_id":identity})
            recovered=await transport.recover("a"*64,transport.receipts.read("a"*64))
            self.assertEqual(recovered["prompt_id"],identity)
            with self.assertRaises(HTTPException) as error: await infer_agent(transport,AgentRequest(model_name="qwen3.5:9b",messages=[{"role":"user","content":"hello"}]),"disabled-agent")
            self.assertEqual(error.exception.status_code,503)

    async def test_plain_text_uses_verified_budget_without_truncating_input(self):
        def handler(request):
            if request.url.path=="/api/tags":return httpx.Response(200,json={"models":[{"name":"test-model","digest":"test-digest"}]})
            if request.url.path=="/queue":return httpx.Response(200,json={"queue_running":[],"queue_pending":[]})
            if request.url.path=="/free":return httpx.Response(200)
            sent=json.loads(request.content)
            self.assertEqual(sent["messages"][0]["content"],"中文上下文"*1000)
            self.assertEqual(sent["options"]["num_ctx"],8192)
            return httpx.Response(200,json={"message":{"content":"ok"}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            transport=InferenceTransport(Settings(text_model="test-model",receipt_dir=self.directory/"text-receipts",agent_tokenizer_dir=self.directory),client)
            result=await transport.text(GenerateRequest(model="text",model_name="test-model",prompt="中文上下文"*1000,context_length=8192,max_tokens=512),"plain-step")
            self.assertEqual(result["content"],"ok")
