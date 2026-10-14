"""Private durable receipts for local model calls; recovery never submits."""
import json


def save_receipt(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(path)


def find_prompt(request, endpoint, request_id):
    history = request(endpoint + '/history?max_items=500')
    matches = [key for key, entry in history.items() if len(entry.get('prompt', [])) > 3 and entry['prompt'][3].get('studio_request_id') == request_id]
    queue = request(endpoint + '/queue')
    matches.extend(item[1] for item in [*queue.get('queue_running', []), *queue.get('queue_pending', [])] if len(item) > 3 and item[3].get('studio_request_id') == request_id)
    matches = set(matches)
    if len(matches) > 1:
        raise RuntimeError('Multiple ComfyUI prompts match this saved receipt; inspect before continuing')
    return next(iter(matches), None)
