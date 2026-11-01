# SPDX-License-Identifier: AGPL-3.0-or-later
"""Optional offline tokenizer, pinned to a verified installed Ollama model."""
import hashlib
import json
from fastapi import HTTPException


class AgentTokenizer:
    def __init__(self, directory, model):
        from tokenizers import Tokenizer
        self.verification = json.loads((directory / "verification.json").read_text(encoding="utf-8"))
        data = (directory / "tokenizer.json").read_bytes()
        if self.verification.get("model") != model or not self.verification.get("installedModelVocabularyMatched") or not self.verification.get("installedModelDigest") or hashlib.sha256(data).hexdigest() != self.verification.get("tokenizerSHA256"):
            raise RuntimeError("Agent tokenizer identity verification failed")
        self.model = model
        self.tokenizer = Tokenizer.from_str(data.decode())
        self.tokenizer.no_truncation()
        self.tokenizer.no_padding()

    async def verify_model(self, client, base):
        try:
            response = await client.get(base + "/api/tags")
            response.raise_for_status()
            item = next(item for item in response.json()["models"] if item.get("name") == self.model)
            if item.get("digest") != self.verification["installedModelDigest"]:
                raise ValueError("model changed")
        except Exception as error:
            raise HTTPException(503, "Installed Agent model changed or cannot be verified; verify the offline tokenizer again before inference") from error

    def count(self, serialized):
        return len(self.tokenizer.encode(serialized, add_special_tokens=False).ids)
