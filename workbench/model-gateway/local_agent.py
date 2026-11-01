# SPDX-License-Identifier: AGPL-3.0-or-later
"""Translate tool conversations only. Yingce owns tool execution and approval."""
import copy
import hashlib
import json
import re
import time

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from reference_images import decode_reference


class AgentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_name: str = Field(max_length=200)
    messages: list[dict] = Field(min_length=1, max_length=200)
    tools: list[dict] | None = Field(default=None, max_length=128)
    tool_choice: str | dict | None = "auto"
    max_tokens: int = Field(default=2048, ge=1, le=8192)
    context_length: int = Field(default=8192, ge=2048, le=32768)
    think: bool = False


def prepare(request, tokenizer=None):
    if request.tool_choice not in (None, "auto"):
        raise HTTPException(400, "Local Agent supports automatic tool selection only")
    tools = copy.deepcopy(request.tools or [])
    names = set()
    for tool in tools:
        fn = tool.get("function")
        if set(tool) != {"type", "function"} or tool["type"] != "function" or not isinstance(fn, dict):
            raise HTTPException(400, "Invalid local Agent tool definition")
        name = fn.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", name) or name in names:
            raise HTTPException(400, "Invalid or duplicate local Agent tool name")
        if not isinstance(fn.get("parameters"), dict) or fn["parameters"].get("type") != "object":
            raise HTTPException(400, "Agent tools require object parameters")
        names.add(name)
    messages, outstanding, seen, images = [], {}, set(), 0
    for source in request.messages:
        if set(source) - {"role", "content", "tool_calls", "tool_call_id"}:
            raise HTTPException(400, "Unsupported Agent message fields")
        role = source.get("role")
        if role not in {"system", "user", "assistant", "tool"}:
            raise HTTPException(400, "Invalid Agent conversation role")
        if outstanding and role != "tool":
            raise HTTPException(400, "Agent conversation has unresolved tool results")
        content = source.get("content")
        message = {"role": role, "content": ""}
        if isinstance(content, str):
            message["content"] = content
        elif isinstance(content, list) and role in {"user", "assistant"}:
            texts, pixels = [], []
            for part in content:
                if not isinstance(part, dict):
                    raise HTTPException(400, "Invalid Agent content part")
                if part.get("type") == "text" and isinstance(part.get("text"), str):
                    texts.append(part["text"])
                elif part.get("type") == "image_url" and role == "user":
                    image_url = part.get("image_url")
                    if not isinstance(image_url, dict) or not isinstance(image_url.get("url"), str):
                        raise HTTPException(400, "Agent images require native owned pixels")
                    pixels.append(decode_reference(image_url["url"]).base64())
                    images += 1
                else:
                    raise HTTPException(400, "Unsupported local Agent content")
            message["content"] = "\n".join(texts)
            if pixels: message["images"] = pixels
        elif not (content is None and role == "assistant" and source.get("tool_calls")):
            raise HTTPException(400, "Invalid Agent message content")
        if len(message["content"]) > 200_000 or images > 1:
            raise HTTPException(400, "Local Agent supports bounded text and one reference image")
        if role == "tool":
            identity = source.get("tool_call_id")
            if not isinstance(identity, str) or identity not in outstanding or not isinstance(content, str):
                raise HTTPException(400, "Agent tool result has no matching call")
            message["tool_name"] = outstanding.pop(identity)
        elif "tool_call_id" in source:
            raise HTTPException(400, "Only tool results may reference tool calls")
        calls = source.get("tool_calls", [])
        if not isinstance(calls, list) or len(calls) > 32 or (calls and role != "assistant"):
            raise HTTPException(400, "Invalid Agent tool call history")
        converted = []
        for call in calls:
            if not isinstance(call, dict): raise HTTPException(400, "Invalid Agent call")
            fn = call.get("function", {})
            identity = call.get("id")
            if not isinstance(identity, str) or not identity or identity in seen or not isinstance(fn, dict):
                raise HTTPException(400, "Invalid or duplicate Agent call identity")
            name, args = fn.get("name"), fn.get("arguments")
            try: args = json.loads(args) if isinstance(args, str) else args
            except ValueError as error: raise HTTPException(400, "Invalid Agent call arguments") from error
            if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", name) or not isinstance(args, dict):
                raise HTTPException(400, "Invalid Agent call name or arguments")
            seen.add(identity)
            outstanding[identity] = name
            converted.append({"type": "function", "function": {"name": name, "arguments": args}})
        if converted: message["tool_calls"] = converted
        messages.append(message)
    if outstanding:
        raise HTTPException(400, "Agent conversation ends before tool results")
    # Count the full tool schema and history. Never silently truncate a tool pair.
    budget_messages = [{k: v for k, v in m.items() if k != "images"} for m in messages]
    try:
        serialized = json.dumps({"messages": budget_messages, "tools": tools}, ensure_ascii=False, allow_nan=False)
    except (ValueError, TypeError) as error:
        raise HTTPException(400, "Agent arguments and schemas must contain finite JSON values") from error
    budget = tokenizer.count(serialized) if tokenizer else len(serialized.encode())
    # Ollama owns its chat template. Keep a separate reserve for that template;
    # these are admission estimates, not provider-reported usage or exact counts.
    reserve = max(4096, 64 * (len(messages) + len(tools))) if tokenizer else 512
    estimated = budget + reserve + images * 2048
    if estimated + request.max_tokens > request.context_length:
        raise HTTPException(400, "Local Agent context budget exceeded; compact the conversation or configure a larger supported window")
    return messages, tools, names, {"method": "verified-tokenizer-with-template-reserve" if tokenizer else "utf8-bytes-with-reserve", "estimatedInputTokens": estimated, "templateReserve": reserve, "contextWindowTokens": request.context_length, "maxOutputTokens": request.max_tokens}


def parse_result(payload, digest, names):
    if not isinstance(payload, dict) or payload.get("done") is not True or payload.get("done_reason") == "length":
        raise ValueError("incomplete model response")
    message = payload.get("message")
    if not isinstance(message, dict): raise ValueError("missing assistant message")
    content, thinking = message.get("content", ""), message.get("thinking", "")
    if not isinstance(content, str) or not isinstance(thinking, str): raise ValueError("invalid assistant content")
    calls = message.get("tool_calls", [])
    if not isinstance(calls, list) or len(calls) > 32: raise ValueError("invalid tool calls")
    normalized = []
    for index, call in enumerate(calls):
        if not isinstance(call, dict) or call.get("type", "function") != "function": raise ValueError("invalid tool call")
        fn = call.get("function")
        if not isinstance(fn, dict) or fn.get("name") not in names or not isinstance(fn.get("arguments"), dict):
            raise ValueError("unknown tool or invalid arguments")
        json.dumps(fn["arguments"], allow_nan=False)
        identity = "call_" + hashlib.sha256(f"{digest}:{index}".encode()).hexdigest()[:24]
        normalized.append({"id": identity, "type": "function", "function": {"name": fn["name"], "arguments": fn["arguments"]}})
    if not content.strip() and not normalized: raise ValueError("empty assistant response")
    usage = {"prompt_tokens": payload.get("prompt_eval_count", 0), "completion_tokens": payload.get("eval_count", 0)}
    if any(type(value) is not int or value < 0 for value in usage.values()): raise ValueError("invalid usage")
    usage["total_tokens"] = sum(usage.values())
    return {"message": {"role": "assistant", "content": content, "thinking": thinking, "tool_calls": normalized}, "usage": usage}


def recover_saved_agent(transport, digest, receipt):
    try:
        result = parse_result(receipt["upstream_response"], digest, set(receipt["allowed_tool_names"]))
    except (KeyError, ValueError, TypeError) as error:
        raise HTTPException(409, "Saved local Agent response cannot be verified; inference was not repeated") from error
    result["context_budget"] = receipt.get("context_budget")
    receipt["result"], receipt["status"] = result, "succeeded"
    transport.receipts.write(digest, receipt)
    return receipt


async def infer_agent(transport, request, key):
    if request.model_name != transport.settings.text_model:
        raise HTTPException(400, "Configured model does not match the local Agent model")
    if transport.agent_tokenizer_error:
        raise HTTPException(503, "Configured offline Agent tokenizer is unavailable; repair its verified files before inference")
    tokenizer = transport.agent_tokenizer
    messages, tools, names, budget = prepare(request, tokenizer)
    digest = transport.receipts.digest(key)
    fingerprint = hashlib.sha256(json.dumps(request.model_dump(), sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    async with transport.device:
        previous = transport.receipts.read(digest)
        if previous:
            if previous.get("fingerprint") != fingerprint or previous.get("operation") != "agent":
                raise HTTPException(409, "Idempotency-Key was used with different inputs")
            return (await transport.recover(digest, previous))["result"]
        if tokenizer:
            await tokenizer.verify_model(transport.client, transport.settings.ollama_url)
        await transport.wait_idle()
        await transport.comfy("POST", "/free", json={"unload_models": True, "free_memory": True})
        transport.family = None
        receipt = {"model": "text", "operation": "agent", "fingerprint": fingerprint, "created_at": time.time(), "status": "submitting"}
        transport.receipts.write(digest, receipt)
        try:
            response = await transport.client.post(transport.settings.ollama_url + "/api/chat", json={"model": request.model_name, "messages": messages, "tools": tools, "stream": False, "keep_alive": 0, "think": request.think, "options": {"num_ctx": request.context_length, "num_predict": request.max_tokens}})
            response.raise_for_status()
            payload = response.json()
            # Retain the actual completed provider response before translation.
            # A parser repair can recover this result without another inference.
            receipt["upstream_response"] = payload
            receipt["allowed_tool_names"] = sorted(names)
            receipt["context_budget"] = budget
            transport.receipts.write(digest, receipt)
            result = parse_result(payload, digest, names)
            result["context_budget"] = budget
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            receipt["failure"] = {"kind": type(error).__name__, "reason": str(error) if isinstance(error, ValueError) else "Ollama response could not be verified"}
            transport.receipts.write(digest, receipt)
            raise HTTPException(502, "Local Agent inference outcome is uncertain; inspect its receipt before starting a new step") from error
        receipt["result"], receipt["status"] = result, "succeeded"
        transport.receipts.write(digest, receipt)
        return result
