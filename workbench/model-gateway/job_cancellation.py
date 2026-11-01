# SPDX-License-Identifier: AGPL-3.0-or-later
"""Scoped cancellation of existing receipts, never a new inference queue."""
import time
from fastapi import HTTPException


def was_interrupted(entry, prompt_id):
    for message in entry.get("status", {}).get("messages", []):
        if isinstance(message, list) and len(message) == 2 and message[0] == "execution_interrupted" and isinstance(message[1], dict) and message[1].get("prompt_id") == prompt_id:
            return True
    return False


def contains(items, prompt_id):
    return any(isinstance(item, list) and len(item) > 1 and item[1] == prompt_id for item in items)


async def cancel_job(transport, prompt_id):
    transport.receipts.prompt_path(prompt_id)
    async with transport.cancellation:
        owned = transport.receipts.for_prompt(prompt_id)
        queue = await transport.comfy("GET", "/queue")
        history = await transport.comfy("GET", "/history/" + prompt_id)
        entry = history.get(prompt_id)
        if owned is None:
            # Old or response-lost submissions may predate the prompt index.
            candidates = queue.get("queue_running", []) + queue.get("queue_pending", [])
            if isinstance(entry, dict):
                candidates += [entry.get("prompt", [])]
            for item in candidates:
                if not isinstance(item, list) or len(item) < 4 or item[1] != prompt_id or not isinstance(item[3], dict):
                    continue
                digest = item[3].get("yingce_request")
                if not isinstance(digest, str):
                    continue
                receipt = transport.receipts.read(digest)
                if receipt and receipt.get("model") in {"image", "video"} and receipt.get("prompt_id") in {None, prompt_id}:
                    receipt["prompt_id"] = prompt_id
                    transport.receipts.write(digest, receipt)
                    owned = digest, receipt
                    break
        if owned is None:
            raise HTTPException(404, "This prompt has no verified Yingce submission receipt")
        digest, receipt = owned
        if receipt.get("model") not in {"image", "video"}:
            raise HTTPException(400, "This receipt is not a cancellable media submission")
        state = await transport.status(prompt_id)
        if state.get("reason") == "receipt_missing":
            raise HTTPException(409, "The execution receipt is missing; cancellation has not been confirmed")
        if state["status"] in {"succeeded", "failed", "cancelled"}:
            return {"prompt_id": prompt_id, "status": state["status"]}
        running = contains(queue.get("queue_running", []), prompt_id)
        pending = contains(queue.get("queue_pending", []), prompt_id)
        if not running and not pending:
            raise HTTPException(409, "The execution receipt is missing; cancellation has not been confirmed")
        if running and not transport.settings.targeted_cancel:
            raise HTTPException(409, "Targeted interruption has not been enabled for this ComfyUI version")
        receipt.setdefault("cancel_requested_at", time.time())
        transport.receipts.write(digest, receipt)
        # Both operations are scoped to the exact prompt. Never clear a queue,
        # delete history/output files, or send an empty/global interrupt body.
        await transport.comfy("POST", "/queue", json={"delete": [prompt_id]})
        if transport.settings.targeted_cancel:
            await transport.comfy("POST", "/interrupt", json={"prompt_id": prompt_id})
        latest_queue = await transport.comfy("GET", "/queue")
        latest_history = await transport.comfy("GET", "/history/" + prompt_id)
        if pending and not contains(latest_queue.get("queue_running", []) + latest_queue.get("queue_pending", []), prompt_id) and prompt_id not in latest_history:
            # ComfyUI moves running->history under one queue mutex. A removed
            # queued entry is therefore distinct from an interrupted execution.
            receipt["cancel_state"] = "removed_pending"
            transport.receipts.write(digest, receipt)
        state = await transport.status(prompt_id)
        return {"prompt_id": prompt_id, "status": state["status"]}
