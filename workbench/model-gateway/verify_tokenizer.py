# SPDX-License-Identifier: AGPL-3.0-or-later
"""Verify an existing tokenizer against Ollama; never download model weights."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit

import httpx


def verify_vocabulary(tokenizer, installed):
    tokens, merges = installed.get("tokenizer.ggml.tokens"), installed.get("tokenizer.ggml.merges")
    vocab = tokenizer.get("model", {}).get("vocab")
    if not isinstance(tokens, list) or not isinstance(merges, list) or not isinstance(vocab, dict) or not vocab:
        raise ValueError("Installed model did not expose a verifiable BPE vocabulary")
    for token, index in vocab.items():
        if type(index) is not int or index < 0 or index >= len(tokens) or tokens[index] != token:
            raise ValueError("Tokenizer vocabulary differs from the installed model")
    added = tokenizer.get("added_tokens", [])
    for token in added:
        index = token.get("id")
        if type(index) is not int or index < 0 or index >= len(tokens) or tokens[index] != token.get("content"):
            raise ValueError("Tokenizer added tokens differ from the installed model")
    rules = tokenizer.get("model", {}).get("merges", [])
    official = [" ".join(pair) if isinstance(pair, list) and len(pair) == 2 and all(isinstance(item,str) for item in pair) else pair for pair in rules]
    if official != merges:
        raise ValueError("Tokenizer merge rules differ from the installed model")
    return {"vocabularyEntriesVerified": len(vocab), "addedTokensVerified": len(added), "mergeRulesVerified": len(merges)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--model", default="qwen3.5:9b")
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    parser.add_argument("--source", required=True, help="Official tokenizer repository URL; stored for provenance")
    parser.add_argument("--revision", required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    source = urlsplit(args.source)
    if source.scheme != "https" or not source.hostname or source.username or source.password or not re.fullmatch(r"[a-f0-9]{40}",args.revision) or not re.fullmatch(r"[a-f0-9]{64}",args.sha256):
        parser.error("Source must be HTTPS and revision/SHA256 must be pinned hashes")
    directory = args.directory.resolve(strict=True)
    path = directory / "tokenizer.json"
    if path.stat().st_size > 64 * 1024 * 1024: parser.error("Tokenizer file exceeds 64 MiB")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != args.sha256: parser.error("Tokenizer SHA256 does not match its pinned source")
    tokenizer = json.loads(data)
    with httpx.Client(timeout=30,trust_env=False) as client:
        response = client.post(args.ollama_url.rstrip("/")+"/api/show",json={"model":args.model,"verbose":True})
        response.raise_for_status()
        counts = verify_vocabulary(tokenizer,response.json()["model_info"])
        inventory = client.get(args.ollama_url.rstrip("/")+"/api/tags")
        inventory.raise_for_status()
        digest = next(item["digest"] for item in inventory.json()["models"] if item.get("name") == args.model)
        if not re.fullmatch(r"[a-f0-9]{64}",digest): raise ValueError("Installed model digest is invalid")
    receipt = {"model":args.model,"installedModelDigest":digest,"source":args.source,"revision":args.revision,"tokenizerSHA256":args.sha256,**counts,"installedModelVocabularyMatched":True,"weightsDownloaded":False}
    descriptor, temporary = tempfile.mkstemp(prefix="verification-",dir=directory)
    try:
        with os.fdopen(descriptor,"w",encoding="utf-8") as stream:
            json.dump(receipt,stream,ensure_ascii=False,indent=2);stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,directory/"verification.json")
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
    print(json.dumps(receipt,ensure_ascii=False))


if __name__ == "__main__": main()
