"""Generate owned local sample assets with durable receipts; never retry uncertain submits.

Only loopback model adapters are used. Interrupted submissions are reconciled
against the adapter's existing task database before another POST is considered.

Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
"""
import argparse
import base64
import hashlib
import json
import math
import os
import random
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path(__file__).resolve().parents[2]
# The first 384x224 run is retained as failure evidence. A new immutable
# intent namespace avoids reusing its completed-but-corrupt model outputs.
PROFILE = 'wan640-v2'
WORK = ROOT / 'output/optimization-20261018/samples' / PROFILE
EVIDENCE = ROOT / 'docs/studio/evidence/optimization-20261018/samples' / PROFILE
ADAPTER = 'http://127.0.0.1:13003'
DB = Path(os.environ['USERPROFILE']) / '.cache/codex-studio-toolchains/studio-local/local-models/local-model-tasks.db'
OPENER = build_opener(ProxyHandler({}))
LAB = Path(os.environ['USERPROFILE']) / '.cache/codex-studio-toolchains/studio-local'
FFMPEG = Path(os.environ['USERPROFILE']) / '.cache/codex-studio-toolchains/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe'
FFPROBE = FFMPEG.with_name('ffprobe.exe')
AUDIO = 'http://127.0.0.1:13004'

PRESET_DIRECTIONS = {
    'camera-push': 'A small red fox sits beside a blue enamel lantern on a wooden table. The fox remains still. The camera slowly dollies forward, from a medium view into a close view, the lantern and fox grow larger in the frame. Gentle cinematic camera movement, no cuts, no text.',
    'camera-orbit': 'A blue enamel lantern sits on a table with a small red fox behind it. A slow camera orbit moves around the lantern from its front toward a three quarter side view. The lantern stays centered while the background perspective shifts. The product does not spin. Smooth continuous single shot, no text.',
    'camera-static': 'A small red fox sits beside a blue enamel lantern on a wooden table. Static locked camera, the table edges and background stay completely fixed. The fox gently blinks and breathes, tiny natural motion only. No pan, no zoom, no camera shake, no cuts, no text.',
    'camera-follow': 'A small red fox walks steadily toward the right beside a blue enamel lantern in a woodland clearing. The camera tracks alongside the walking fox, keeping its body at the same screen position while the background drifts left. Smooth horizontal tracking shot, clear feet walking, no cuts, no text.',
    'lighting-soft': 'A small red fox beside a blue enamel lantern on a table, soft diffused daylight, very gentle soft shadows, evenly lit fur and readable material detail, calm breathing and slight ear movement, static camera, no text.',
    'lighting-rim': 'A small red fox beside a blue enamel lantern on a table in a dark room. Warm golden rim lighting outlines the fox ears and fur, deep dark background, cinematic high contrast, readable blue enamel edges. The fox slowly turns its head slightly, static camera, no text.',
    'lighting-product': 'A blue enamel lantern on a clean studio tabletop with a small red fox behind it. Broad large softbox lights reveal the metal form and blue enamel surface, clean neutral background, soft reflections move gently over the metal, fixed camera, no text.',
    'style-watercolor': 'A small red fox sits beside a blue lantern in a watercolor picture book. Visible watercolor pigments, softly bleeding edges, textured cream paper, muted warm colors. The illustrated fox blinks and the lantern glow flickers softly. Retain hand painted watercolor style throughout, static camera, no photorealism, no text.',
    'style-cinema': 'A real small red fox sits beside a blue enamel lantern on a wooden table. Natural cinematic colors, realistic fur and material texture, restrained contrast, subtle film grain. The fox breathes and blinks in natural daylight, cinematic live action quality, static camera, no illustration, no text.',
    'effect-dust': 'A small red fox sits beside a blue enamel lantern on a wooden table. Many tiny floating dust motes drift slowly through a diagonal sunbeam in the foreground and background. Visible sparkling suspended particles, the fox face and lantern remain clear and unobstructed, static camera, no text.',
    'effect-rain': 'A small red fox sits beside a blue enamel lantern on an outdoor wooden table. Gentle rain falls visibly as small bright streaks, droplets splash on the table, subtle wet reflections shimmer. The fox and blue lantern remain easy to see. Static camera, continuous gentle rainfall, no text.',
}
RECIPES = {
    'product': ('A ceramic blue travel mug with a fitted lid on a clean light gray studio table, warm softbox lighting, centered product, realistic material, no brand or letters.', 'A ceramic blue travel mug on a clean studio table. A hand gently lifts the mug, showing its compact shape and fitted lid. Product demonstration, clean soft studio lighting, a simple clear action, no text.'),
    'story': ('A small red fox at the edge of a woodland path, holding a blue lantern in its mouth at dusk, warm storybook cinematic illustration, full body, no text.', 'A small red fox carries a glowing blue lantern down a woodland path toward a cozy distant house at dusk. The fox takes a few gentle steps, a warm light shows the path. One clear action, coherent illustrated story style, no cuts, no text.'),
    'explain': ('A small green seedling in a transparent glass pot on a bright white tabletop beside a sunlit window, visible soil and roots, science teaching visual, clear realistic botanical detail, no text.', 'A green seedling in a glass pot beside a sunlit window. A hand gently rotates the pot toward the light, showing the stem and leaves oriented toward daylight. Clear close up educational demonstration, steady camera, no written text.'),
    'presenter': ('A friendly adult female science presenter with short dark hair in a plain navy shirt, facing the camera in a bright uncluttered home studio with a small green plant, medium close up, natural realistic face, no text.', 'A friendly adult female science presenter with short dark hair in a navy shirt faces the camera. She makes one small explanatory hand gesture and nods naturally. Stable medium close up, natural soft daylight, unobstructed face, clear calm presentation, no text.'),
    'music': ('A peaceful blue mountain lake at dawn with a lone small wooden boat, misty pink sky and soft sunrise reflections, cinematic wide composition, no text.', 'A peaceful mountain lake at dawn, a small wooden boat drifts slowly across calm water, mist rolls softly above the blue surface, sunrise reflections shimmer. Gentle contemplative movement for an instrumental music mood film, one continuous wide shot, no text.'),
}
STORE_RECIPE = ('An inviting small independent coffee shop named Willow Corner, a plain unbranded white ceramic cup of coffee on a warm wooden counter, pastries softly visible behind it, a barista hand beside the cup, warm morning daylight, realistic commercial photography, no text or logos.', 'At Willow Corner coffee shop, a barista hand gently slides a plain white ceramic cup of coffee across the wooden counter toward the viewer. A subtle curl of steam rises from the cup. Warm morning sunlight and softly blurred pastries in the background, inviting local cafe advertisement, stable close up, one clear action, no text or logos.')
REPAIR_TASKS = [
    {'key': 'repair-image-orbit', 'kind': 'image', 'preset': 'camera-orbit', 'seed': 184100, 'prompt': 'Front view of a blue enamel camping lantern centered on a round wooden table, a small red fox far behind it on the left, in a bright room with a large grid window and visible depth, wide product photography composition, full lantern including top handle and feet, no text.'},
    {'key': 'repair-camera-orbit', 'kind': 'video', 'preset': 'camera-orbit', 'seed': 184101, 'requires': 'repair-image-orbit', 'prompt': 'The camera moves steadily clockwise around the stationary blue camping lantern by forty five degrees, from a front view to a side view. The lantern stays at the center and keeps the same size. The window and distant fox visibly move sideways in parallax behind the lantern. A clear cinematic orbital camera move, one continuous shot, no zoom, no object rotation, no cuts.'},
    {'key': 'repair-image-follow', 'kind': 'image', 'preset': 'camera-follow', 'seed': 184200, 'prompt': 'Wide strict side view of one small red fox walking to the right along a level woodland path, the entire fox from nose to tail and all four paws visible, one front paw raised mid step, fox centered with open space ahead, camera at fox eye height, distant trees and a small blue lantern beside the path, natural daylight, sharp realistic wildlife photography, no text.'},
    {'key': 'repair-camera-follow', 'kind': 'video', 'preset': 'camera-follow', 'seed': 184201, 'requires': 'repair-image-follow', 'prompt': 'Side tracking camera follows a red fox walking steadily to the right along a straight woodland path. The camera trucks right at exactly the speed of the fox. The full body fox stays centered at the same size, its paws walk naturally. The trees, ground and blue lantern slide left behind it. A smooth side tracking wildlife shot, no approach toward camera, no zoom, no cuts.', 'negative': 'blurry, out of focus, extra legs, malformed fox, moving toward the camera, zoom in, camera shake, cuts, text'},
    {'key': 'repair-style-watercolor', 'kind': 'video', 'preset': 'style-watercolor', 'seed': 184301, 'reference_path': str(ROOT / 'web/public/studio-presets/style-watercolor.webp'), 'prompt': 'A gentle two dimensional watercolor animation of a little red fox beside a blue lantern in a painted forest. The painted fox blinks and gently moves its tail, the painted lantern light softly flickers. All elements remain watercolor pigment on cream paper throughout. A finished animated storybook scene, no live action, no painting process, no people, no artist hands, fixed camera.', 'negative': 'human, hands, painting brush, pen, artist, live action, photorealistic animal, text, camera movement'},
]
def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)

def http(path, body=None, raw=False, endpoint=ADAPTER):
    request = Request(endpoint + path, data=None if body is None else json.dumps(body, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'})
    with OPENER.open(request, timeout=45) as response:
        data = response.read()
        return data if raw else json.loads(data)

def plan(store_only=False, repair_only=False):
    tasks = []
    if repair_only: tasks = REPAIR_TASKS
    if store_only:
        tasks = [
            {'key': 'recipe-image-store', 'kind': 'image', 'recipe': 'store', 'prompt': STORE_RECIPE[0], 'seed': 182005},
            {'key': 'recipe-store', 'kind': 'video', 'recipe': 'store', 'prompt': STORE_RECIPE[1], 'seed': 183005, 'requires': 'recipe-image-store'},
        ]
    for index, (preset, prompt) in enumerate(PRESET_DIRECTIONS.items()):
        if store_only or repair_only: break
        reference = preset if preset != 'camera-push' else 'baseline'
        tasks.append({'key': 'preset-' + preset, 'kind': 'video', 'preset': preset, 'prompt': prompt, 'seed': 181000 + index, 'reference_path': str(ROOT / 'web/public/studio-presets' / (reference + '.webp'))})
    for index, (recipe, prompts) in enumerate(RECIPES.items()):
        if store_only or repair_only: break
        tasks.append({'key': 'recipe-image-' + recipe, 'kind': 'image', 'recipe': recipe, 'prompt': prompts[0], 'seed': 182000 + index})
    for index, (recipe, prompts) in enumerate(RECIPES.items()):
        if store_only or repair_only: break
        tasks.append({'key': 'recipe-' + recipe, 'kind': 'video', 'recipe': recipe, 'prompt': prompts[1], 'seed': 183000 + index, 'requires': 'recipe-image-' + recipe})
    destination = WORK / ('repair-plan.json' if repair_only else 'store-plan.json' if store_only else 'plan.json')
    if destination.exists():
        saved = json.loads(destination.read_text(encoding='utf-8'))
        if saved['tasks'] != tasks: raise RuntimeError('A saved plan differs; retain its receipts rather than overwriting it')
        return saved
    value = {'schema_version': 1, 'source': 'Original local model generation for new-api; no third-party footage', 'tasks': tasks, 'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    atomic_json(destination, value)
    return value

def receipt_path(task): return WORK / 'receipts' / (task['key'] + '.json')

def recovered_id(tag):
    # Read-only reconciliation. Never modify the adapter's private task state.
    with sqlite3.connect(f'file:{DB.as_posix()}?mode=ro', uri=True, timeout=10) as database:
        rows = database.execute('SELECT id, body FROM tasks WHERE body LIKE ?', ('%' + tag + '%',)).fetchall()
    matches = [row[0] for row in rows if json.loads(row[1]).get('metadata', {}).get('studio_sample_request') == tag]
    if len(matches) > 1: raise RuntimeError('Multiple matching local submissions need manual reconciliation')
    return matches[0] if matches else None

def advance(task, all_tasks):
    path = receipt_path(task)
    receipt = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
    if receipt and receipt.get('status') == 'completed': return receipt
    if task.get('requires'):
        required = json.loads(receipt_path(next(item for item in all_tasks if item['key'] == task['requires'])).read_text(encoding='utf-8'))
        if required.get('status') != 'completed': raise RuntimeError('A required reference image is not completed')
    if receipt is None:
        metadata = {'seed': task['seed'], 'studio_sample_request': 'optimization-20261018-' + PROFILE + '-' + task['key']}
        model = 'flux.2-klein-4b' if task['kind'] == 'image' else 'wan2.2-ti2v-5b'
        body = {'model': model, 'prompt': task['prompt'], 'size': '512x320' if task['kind'] == 'image' else '640x384', 'metadata': metadata}
        if task['kind'] == 'video':
            body['seconds'] = 3
            metadata.update({'frames': 49, 'fps': 16})
            if task.get('negative'): metadata['negative'] = task['negative']
        reference = task.get('reference_path')
        if task.get('requires'): reference = required['output_path']
        if reference:
            data = Path(reference).read_bytes()
            mime = 'image/webp' if str(reference).endswith('.webp') else 'image/png'
            body['input_reference'] = 'data:' + mime + ';base64,' + base64.b64encode(data).decode()
        if task['kind'] == 'image': body['idempotency_key'] = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        receipt = {'key': task['key'], 'status': 'intent_saved', 'request': body, 'tag': metadata['studio_sample_request'], 'submitted_at': time.time()}
        atomic_json(path, receipt)
        response = http('/studio-local/v1/images/jobs' if task['kind'] == 'image' else '/v1/videos', body)
        receipt.update({'adapter_id': response['id'], 'status': response['status'], 'adapter_response': response})
        atomic_json(path, receipt)
    if not receipt.get('adapter_id'):
        found = recovered_id(receipt['tag'])
        if not found:
            raise RuntimeError('Submission result is uncertain and no matching receipt exists. Inspect intent and service logs; do not blindly submit again.')
        receipt['adapter_id'] = found
    prefix = '/studio-local/v1/images/jobs/' if task['kind'] == 'image' else '/v1/videos/'
    response = http(prefix + receipt['adapter_id'])
    receipt.update({'status': response['status'], 'adapter_response': response, 'last_checked_at': time.time()})
    if response['status'] == 'completed':
        extension = '.png' if task['kind'] == 'image' else '.mp4'
        output = WORK / 'raw' / (task['key'] + extension)
        output.parent.mkdir(parents=True, exist_ok=True)
        data = http(prefix + receipt['adapter_id'] + '/content', raw=True)
        output.write_bytes(data)
        receipt.update({'output_path': str(output), 'output_sha256': hashlib.sha256(data).hexdigest(), 'output_bytes': len(data), 'elapsed_sec': round(time.time() - receipt['submitted_at'], 2)})
        proof = {key: value for key, value in receipt.items() if key != 'request'}
        proof['request'] = {key: value for key, value in receipt['request'].items() if key != 'input_reference'}
        if 'input_reference' in receipt['request']:
            proof['reference_sha256'] = hashlib.sha256(base64.b64decode(receipt['request']['input_reference'].split(',', 1)[1])).hexdigest()
        atomic_json(EVIDENCE / (task['key'] + '.json'), proof)
    atomic_json(path, receipt)
    if response['status'] in ['failed', 'uncertain']: raise RuntimeError(json.dumps({'key': task['key'], 'status': response['status'], 'error': response.get('error'), 'adapter_id': receipt['adapter_id']}))
    return receipt

def advance_audio(key, body):
    """The worker has no idempotency key; reconcile a saved intent before retry."""
    path = WORK / 'receipts' / (key + '.json')
    receipt = json.loads(path.read_text(encoding='utf-8')) if path.exists() else None
    if receipt is not None and {key: value for key, value in receipt['request'].items() if key != 'studio_sample_request'} != body:
        raise RuntimeError('The immutable audio input changed. Retain its original receipt and use a distinct reviewed task.')
    if receipt and receipt.get('status') == 'completed': return receipt
    if receipt is None:
        tag = 'optimization-20261018-' + PROFILE + '-' + key
        body = {**body, 'studio_sample_request': tag}
        receipt = {'key': key, 'status': 'intent_saved', 'request': body, 'tag': tag, 'submitted_at': time.time()}
        atomic_json(path, receipt)
        response = http('/studio-media/v1/jobs', body, endpoint=AUDIO)
        receipt.update({'adapter_id': response['id'], 'status': response['status']})
        atomic_json(path, receipt)
    if not receipt.get('adapter_id'):
        database_path = LAB / 'real-audio/jobs.db'
        with sqlite3.connect(f'file:{database_path.as_posix()}?mode=ro', uri=True, timeout=10) as database:
            rows = database.execute('SELECT id, request FROM jobs WHERE request LIKE ?', ('%' + receipt['tag'] + '%',)).fetchall()
        matches = [row[0] for row in rows if json.loads(row[1]).get('studio_sample_request') == receipt['tag']]
        if len(matches) != 1: raise RuntimeError('Uncertain audio submission: inspect the saved worker receipt before resubmitting')
        receipt['adapter_id'] = matches[0]
    prefix = '/studio-media/v1/jobs/' + receipt['adapter_id']
    response = http(prefix, endpoint=AUDIO)
    receipt.update({'status': response['status'], 'adapter_response': response, 'last_checked_at': time.time()})
    if response['status'] == 'completed':
        extension = '.mp4' if body['operation'] == 'lip_sync' else '.wav'
        output = WORK / 'raw' / (key + extension)
        output.parent.mkdir(parents=True, exist_ok=True)
        data = http(prefix + '/content', raw=True, endpoint=AUDIO)
        output.write_bytes(data)
        receipt.update({'output_path': str(output), 'output_sha256': hashlib.sha256(data).hexdigest(), 'output_bytes': len(data), 'elapsed_sec': round(time.time() - receipt['submitted_at'], 2)})
        proof = {key: value for key, value in receipt.items() if key != 'request'}
        proof['request'] = {key: value for key, value in receipt['request'].items() if key != 'references'}
        proof['references'] = [{**{key: value for key, value in reference.items() if key != 'url'}, 'sha256': hashlib.sha256(base64.b64decode(reference['url'].split(',', 1)[1])).hexdigest()} for reference in receipt['request'].get('references', [])]
        atomic_json(EVIDENCE / (key + '.json'), proof)
    atomic_json(path, receipt)
    if response['status'] in ['failed', 'uncertain']: raise RuntimeError(json.dumps({'key': key, 'status': response['status'], 'error': response.get('error'), 'adapter_id': receipt['adapter_id']}))
    return receipt

def audio_samples():
    for recipe, words in [('explain', 'Plants need light.'), ('presenter', "Let's help plants grow.")]:
        deadline = time.monotonic() + 1900
        while time.monotonic() < deadline:
            receipt = advance_audio('voice-' + recipe, {'operation': 'voice_speech', 'seconds': 3.0625, 'prompt': words, 'voice_id': 'default', 'language': 'en', 'options': {'speed': 1.1, 'pitch': 0, 'pause': 0, 'expression': 0.5}})
            if receipt['status'] == 'completed':
                print(json.dumps({'key': receipt['key'], 'status': receipt['status'], 'adapter_id': receipt['adapter_id']}), flush=True)
                break
            time.sleep(3)
        else: raise TimeoutError('Retain the saved voice task receipt; do not automatically submit it again')
    selected_presenter = 'recipe-presenter'
    lip_key = 'lip-presenter'
    if (EVIDENCE / 'reviews.json').exists():
        presenter_review = json.loads((EVIDENCE / 'reviews.json').read_text(encoding='utf-8'))['recipes'].get('presenter', {})
        selected_presenter = presenter_review.get('task', selected_presenter)
        lip_key = presenter_review.get('lip_task', lip_key)
    video = json.loads((WORK / 'receipts' / (selected_presenter + '.json')).read_text(encoding='utf-8'))
    audio = json.loads((WORK / 'receipts/voice-presenter.json').read_text(encoding='utf-8'))
    voice_metadata = json.loads(subprocess.check_output([str(FFPROBE), '-v', 'error', '-show_format', '-of', 'json', audio['output_path']]))
    duration = max(3.0625, float(voice_metadata['format']['duration']))
    if duration > 6: raise RuntimeError('Review unexpectedly long speech instead of clipping words silently')
    padded = WORK / 'raw/voice-presenter-padded.wav'
    subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', audio['output_path'], '-af', 'apad', '-t', str(duration), '-ar', '24000', '-c:a', 'pcm_s16le', str(padded)], check=True, timeout=120)
    atomic_json(EVIDENCE / 'voice-presenter-padding.json', {'operation': 'FFmpeg silence padding; no new speech generated', 'source_sha256': audio['output_sha256'], 'sha256': hashlib.sha256(padded.read_bytes()).hexdigest(), 'seconds': duration})
    references = [{'type': kind, 'url': 'data:' + mime + ';base64,' + base64.b64encode(source.read_bytes()).decode()} for kind, mime, source in [('video', 'video/mp4', Path(video['output_path'])), ('audio', 'audio/wav', padded)]]
    deadline = time.monotonic() + 1900
    while time.monotonic() < deadline:
        receipt = advance_audio(lip_key, {'operation': 'lip_sync', 'seconds': duration, 'prompt': "Let's help plants grow.", 'references': references})
        if receipt['status'] == 'completed':
            print(json.dumps({'key': receipt['key'], 'status': receipt['status'], 'adapter_id': receipt['adapter_id']}), flush=True)
            break
        time.sleep(3)
    else: raise TimeoutError('Retain the saved lip-sync receipt; do not automatically submit it again')

def inspect_samples():
    """Decode real artifacts and record actual runtime graphs, not declared support."""
    for path in sorted((WORK / 'receipts').glob('*.json')):
        receipt = json.loads(path.read_text(encoding='utf-8'))
        if receipt.get('status') != 'completed': continue
        key = receipt['key']
        output = Path(receipt['output_path'])
        proof_path = EVIDENCE / (key + '.json')
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        prompt_id = receipt.get('adapter_response', {}).get('metadata', {}).get('prompt_id') or receipt.get('adapter_response', {}).get('prompt_id')
        if prompt_id:
            history = http('/history/' + prompt_id, endpoint='http://127.0.0.1:8288').get(prompt_id)
            if history:
                graph = history['prompt'][2]
                graph_bytes = json.dumps(graph, sort_keys=True, separators=(',', ':')).encode()
                atomic_json(EVIDENCE / (key + '-workflow.json'), {'prompt_id': prompt_id, 'graph': graph, 'status': history['status']})
                proof['workflow_sha256'] = hashlib.sha256(graph_bytes).hexdigest()
                proof['actual_nodes'] = {node['class_type']: {name: value for name, value in node['inputs'].items() if not isinstance(value, list)} for node in graph.values() if node['class_type'] in ['KSampler', 'ModelSamplingSD3', 'Wan22ImageToVideoLatent', 'VAEDecodeTiled', 'UNETLoader', 'VAELoader', 'CLIPLoader']}
        metadata = json.loads(subprocess.check_output([str(FFPROBE), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(output)]))
        proof['ffprobe'] = metadata
        if output.suffix == '.mp4':
            subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-i', str(output), '-f', 'null', '-'], check=True, timeout=120)
            contact = WORK / (key + '-review.jpg')
            subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-ss', '0.2', '-i', str(output), '-vf', 'fps=1,scale=480:288,tile=3x1', '-frames:v', '1', str(contact)], check=True, timeout=120)
            proof['contact_sheet'] = str(contact.relative_to(ROOT))
            proof['all_frames_decoded'] = True
        proof['quality_status'] = 'awaiting_visual_review'
        atomic_json(proof_path, proof)
    print('Actual graphs, FFprobe metadata and decode/contact-sheet checks saved; visual effect review remains explicit.')

CATALOG = {
    'store': {'title': 'Willow Corner coffee', 'subject': 'Willow Corner coffee shop', 'caption': 'Willow Corner - a fresh pause.', 'purpose': 'benefit', 'goal': 'product'},
    'product': {'title': 'Blue travel mug', 'subject': 'A blue ceramic travel mug', 'caption': 'Ready for the everyday journey.', 'purpose': 'benefit', 'goal': 'product'},
    'story': {'title': 'The lantern path', 'subject': 'An illustrated fox with a blue lantern', 'caption': 'A small light leads the way home.', 'purpose': 'establish', 'goal': 'story'},
    'explain': {'title': 'Plants and daylight', 'subject': 'A seedling turning toward daylight', 'caption': 'Plants need light.', 'purpose': 'establish', 'goal': 'explain'},
    'presenter': {'title': 'A friendly plant guide', 'subject': 'An original fictional science presenter', 'caption': "Let's help plants grow.", 'purpose': 'opening', 'goal': 'presenter'},
    'music': {'title': 'Dawn on the lake', 'subject': 'A mountain lake and a small wooden boat at dawn', 'caption': 'Dawn on the lake', 'purpose': 'emotion', 'goal': 'story'},
}

def _receipt(key):
    receipt = json.loads((WORK / 'receipts' / (key + '.json')).read_text(encoding='utf-8'))
    if receipt['status'] != 'completed': raise RuntimeError('The actual source is not complete: ' + key)
    output = Path(receipt['output_path'])
    if hashlib.sha256(output.read_bytes()).hexdigest() != receipt['output_sha256']: raise RuntimeError('A saved original output was modified: ' + key)
    return receipt

def _probe(path):
    return json.loads(subprocess.check_output([str(FFPROBE), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))

def _asset(media_id, path, mime):
    return {'id': media_id, 'url': '/' + path.relative_to(ROOT / 'web/public').as_posix(), 'mime_type': mime, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}

def _node(node_id, kind, title, prompt, x, y, **data):
    return {'id': node_id, 'type': 'studio', 'position': {'x': x, 'y': y}, 'data': {'kind': kind, 'title': title, 'prompt': prompt, **data}}

def _take(take_id, media_id, prompt, when, model=None, task_id=None, snapshot=None):
    result = {'id': take_id, 'mediaId': media_id, 'prompt': prompt, 'createdAt': when, 'status': 'completed'}
    if model: result['model'] = model
    if task_id: result['taskId'] = task_id
    if snapshot: result['requestSnapshot'] = json.dumps(snapshot, ensure_ascii=False)
    return result

def compose_clean_replacements():
    """Preserve the clean generated subject; do not label exact edits as inference."""
    for recipe in ['product', 'story', 'presenter']:
        image = _receipt('recipe-image-' + recipe)
        key = 'composite-recipe-' + recipe
        output = WORK / 'raw' / (key + '.mp4')
        if recipe == 'product':
            action = 'Controlled 4% camera push over one clean FLUX-generated mug image; rejected duplicate-mug Wan attempt is not selected.'
            transform = "scale=1280:768:force_original_aspect_ratio=increase,crop=1280:768,zoompan=z='1+0.04*on/48':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=49:s=640x384:fps=16"
        elif recipe == 'story':
            action = 'A controlled gentle pan establishes the original FLUX storybook fox and lantern without deforming its design. A glitched native Wan attempt is rejected, not certified.'
            transform = "scale=1280:768:force_original_aspect_ratio=increase,crop=1280:768,zoompan=z=1.06:x='iw/2-iw/zoom/2+20*on/48':y='ih/2-ih/zoom/2':d=49:s=640x384:fps=16"
        else:
            action = 'A clean original FLUX portrait held as a three-second source for subsequent real speech-driven MuseTalk mouth animation; no native joint audio-video generation is claimed.'
            transform = 'scale=640:384:force_original_aspect_ratio=increase,crop=640:384,setsar=1'
        command = [str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-loop', '1', '-i', image['output_path'], '-vf', transform, '-r', '16', '-frames:v', '49', '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)]
        subprocess.run(command, check=True, timeout=120)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        receipt = {'key': key, 'status': 'completed', 'operation': 'controlled_image_edit', 'engine': 'FFmpeg', 'operation_id': 'edit-' + digest[:24], 'adapter_id': None, 'submitted_at': time.time(), 'request': {'model': 'ffmpeg-image-edit', 'prompt': action, 'size': '640x384', 'metadata': {'frames': 49, 'fps': 16}}, 'source_image_adapter_id': image['adapter_id'], 'source_image_sha256': image['output_sha256'], 'source_image_seed': image['request']['metadata']['seed'], 'command': command, 'output_path': str(output), 'output_sha256': digest, 'output_bytes': output.stat().st_size}
        atomic_json(WORK / 'receipts' / (key + '.json'), receipt)
        atomic_json(EVIDENCE / (key + '.json'), receipt)
    print('Three precise image edits created from real clean local-model frames; not inference receipts.')

def _encode_illustration(output, render):
    from PIL import Image
    process = subprocess.Popen([str(FFMPEG), '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '640x384', '-r', '16', '-i', 'pipe:0', '-an', '-frames:v', '49', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for frame in range(49):
            image = render(frame)
            if not isinstance(image, Image.Image): raise RuntimeError('An illustration frame was not rendered')
            process.stdin.write(image.convert('RGB').tobytes())
        process.stdin.close()
        errors = process.stderr.read().decode(errors='replace')
        if process.wait(timeout=120): raise RuntimeError(errors)
    finally:
        if process.poll() is None: process.terminate()

def create_general_demonstrations():
    """Original controlled illustrations explain intent separately from AI tests."""
    from PIL import Image, ImageDraw
    destination = WORK / 'diagrams'
    destination.mkdir(exist_ok=True)
    def orbit(frame):
        image = Image.new('RGB', (640,384), '#f4f3ef')
        draw = ImageDraw.Draw(image, 'RGBA')
        theta = frame/48 * math.pi/3
        eye = (4.5*math.sin(theta), 2.3, 4.5*math.cos(theta))
        target = (0,.85,0)
        def unit(v):
            norm = math.sqrt(sum(x*x for x in v)); return tuple(x/norm for x in v)
        def cross(a,b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
        forward = unit(tuple(target[i]-eye[i] for i in range(3)))
        right = unit(cross(forward,(0,1,0)))
        up = cross(right,forward)
        def project(point):
            delta = tuple(point[i]-eye[i] for i in range(3))
            z = sum(delta[i]*forward[i] for i in range(3))
            return (320+440*sum(delta[i]*right[i] for i in range(3))/z, 206-440*sum(delta[i]*up[i] for i in range(3))/z, z)
        for x in range(-4,5):
            for a,b in [((x,0,-4),(x,0,4)),((-4,0,x),(4,0,x))]:
                draw.line([project(a)[:2],project(b)[:2]], fill=(145,155,151,105), width=1)
        # Window and orange background marker make the camera parallax visible.
        for x in [-2,-1,0,1,2]: draw.line([project((x,0,-2.5))[:2],project((x,2.5,-2.5))[:2]],fill='#b8c4be',width=2)
        for y in [.5,1,1.5,2,2.5]: draw.line([project((-2,y,-2.5))[:2],project((2,y,-2.5))[:2]],fill='#b8c4be',width=2)
        shapes=[]
        def box(x1,y1,z1,x2,y2,z2,color):
            points=[(x1,y1,z1),(x2,y1,z1),(x2,y2,z1),(x1,y2,z1),(x1,y1,z2),(x2,y1,z2),(x2,y2,z2),(x1,y2,z2)]
            for face in [(0,1,2,3),(4,5,6,7),(0,4,7,3),(1,5,6,2),(3,2,6,7),(0,1,5,4)]:
                q=[project(points[i]) for i in face]
                shapes.append((sum(p[2] for p in q)/4,[(p[0],p[1]) for p in q],color))
        box(-1.3,0,-1.5,-.7,.8,-.9,(208,118,55,255))
        box(-.38,.1,-.3,.38,.24,.3,(34,94,133,255))
        box(-.28,.24,-.22,.28,1.2,.22,(189,216,220,95))
        for x in [-.32,.26]: box(x,.22,-.27,x+.06,1.23,.27,(40,105,149,255))
        box(-.4,1.2,-.32,.4,1.32,.32,(34,94,133,255))
        box(-.16,.3,-.12,.16,.5,.12,(238,184,77,255))
        for _,points,color in sorted(shapes,reverse=True): draw.polygon(points,fill=color,outline=(35,75,92,180))
        handle=[project((.3*math.cos(a),1.32+.34*math.sin(a),0))[:2] for a in [math.pi*i/24 for i in range(25)]]
        draw.line(handle,fill='#225e85',width=5)
        draw.text((20,20),'ORBIT - controlled camera illustration',fill='#263d44')
        draw.text((20,350),'Stationary subject. Camera moves. Not an AI-model result.',fill='#526768')
        return image
    orbit_path = destination / 'camera-orbit.mp4'
    _encode_illustration(orbit_path, orbit)
    source = _receipt('preset-camera-static')
    raw = subprocess.check_output([str(FFMPEG), '-v', 'error', '-i', source['output_path'], '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    if len(raw) != 49*640*384*3: raise RuntimeError('The owned illustration background has an unexpected frame count')
    rng=random.Random(47)
    dust=[(rng.randrange(640),rng.randrange(384),rng.choice([1,1,2]),rng.randrange(70,150)) for _ in range(55)]
    rain=[(rng.randrange(640),rng.randrange(384),rng.randrange(7,14),rng.randrange(50,120)) for _ in range(105)]
    for name in ['effect-dust','effect-rain']:
        def render(frame, name=name):
            start=frame*640*384*3
            image=Image.frombytes('RGB',(640,384),raw[start:start+640*384*3])
            draw=ImageDraw.Draw(image,'RGBA')
            if name=='effect-dust':
                for x,y,r,alpha in dust:
                    xx=(x+frame*.45)%640;yy=(y-frame*.22)%384
                    draw.ellipse((xx-r,yy-r,xx+r,yy+r),fill=(255,246,210,alpha))
            else:
                for x,y,length,alpha in rain:
                    xx=(x-frame*.3)%640;yy=(y+frame*7)%384
                    draw.line((xx,yy,xx-1,yy+length),fill=(235,245,250,alpha),width=1)
            return image
        _encode_illustration(destination/(name+'.mp4'),render)
    for name in ['camera-orbit','effect-dust','effect-rain']:
        file=destination/(name+'.mp4')
        atomic_json(EVIDENCE/(name+'-general-demonstration.json'),{'kind':'motion-diagram','engine':'Original geometry renderer' if name=='camera-orbit' else 'Original procedural particle compositor over owned local-model footage','source_video_sha256':None if name=='camera-orbit' else source['output_sha256'],'seed':None if name=='camera-orbit' else 47,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'bytes':file.stat().st_size,'not_model_verification':True,'ffprobe':_probe(file)})
    print('Three original controlled demonstrations created; no model verification is implied.')

def install_samples():
    """Package only manually reviewed real outputs; keep raw and published hashes."""
    reviews_path = EVIDENCE / 'reviews.json'
    if not reviews_path.exists(): raise RuntimeError('Inspect the real outputs and save explicit reviews before packaging')
    reviews = json.loads(reviews_path.read_text(encoding='utf-8'))
    # Check every required source before changing the published catalog.
    for recipe in CATALOG:
        _receipt('recipe-image-'+recipe)
        _receipt(reviews['recipes'][recipe].get('task','recipe-'+recipe))
    for key in ['voice-explain','voice-presenter',reviews['recipes']['presenter'].get('lip_task','lip-presenter')]: _receipt(key)
    preset_manifest_path = ROOT / 'web/public/studio-presets/manifest.json'
    preset_manifest = json.loads(preset_manifest_path.read_text(encoding='utf-8-sig'))
    videos = ROOT / 'web/public/studio-presets/videos'
    videos.mkdir(exist_ok=True)
    for preset in PRESET_DIRECTIONS:
        review = reviews['presets'].get(preset)
        if not review or not review.get('source_reviewed'): raise RuntimeError('Review this preset output first: ' + preset)
        key = review.get('task', 'preset-' + preset)
        receipt = _receipt(key)
        destination = videos / (preset + '.mp4')
        subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', receipt['output_path'], '-an', '-vf', 'scale=480:288', '-c:v', 'libx264', '-preset', 'medium', '-crf', '25', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(destination)], check=True, timeout=120)
        digest = hashlib.sha256(destination.read_bytes()).hexdigest()
        model_video = {'url': '/studio-presets/videos/' + destination.name, 'model': 'Wan 2.2 TI2V 5B', 'modelId': 'wan2.2-ti2v-5b', 'sha256': digest, 'kind': 'model-output', 'verification': 'verified' if review.get('effect_passed') and review.get('reviewed_sha256') == receipt['output_sha256'] else 'unverified', 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(receipt['submitted_at'])), 'notes': review['notes']}
        if review.get('general_demonstration'):
            general=WORK/'diagrams'/(preset+'.mp4')
            target=videos/(preset+'-illustration.mp4')
            target.write_bytes(general.read_bytes())
            preset_manifest[preset]['modelTest'] = model_video
            illustration_sha = hashlib.sha256(target.read_bytes()).hexdigest()
            preset_manifest[preset]['video'] = {'url':'/studio-presets/videos/'+target.name,'model':'Original controlled illustration','sha256':illustration_sha,'kind':'motion-diagram','verification':'verified' if review.get('illustration_sha256') == illustration_sha else 'unverified','notes':'Illustrates the intended direction with original controlled geometry or particle compositing. The separate Wan model test did not pass and is not certified by this illustration.'}
        else:
            preset_manifest[preset]['video'] = model_video
        atomic_json(EVIDENCE / (preset + '-published.json'), {'task': key, 'adapter_id': receipt['adapter_id'], 'original_sha256': receipt['output_sha256'], 'published_sha256': digest, 'published_bytes': destination.stat().st_size, 'review': review, 'ffprobe': _probe(destination)})
    atomic_json(preset_manifest_path, preset_manifest)
    samples = []
    shared = ROOT / 'web/public/studio-examples/shared'
    shared.mkdir(exist_ok=True)
    (shared / 'music.mp3').write_bytes((ROOT / 'web/public/studio-example/music.mp3').read_bytes())
    for recipe, text in CATALOG.items():
        review = reviews['recipes'].get(recipe)
        if not review or not review.get('source_reviewed'): raise RuntimeError('Review this recipe output first: ' + recipe)
        image = _receipt('recipe-image-' + recipe)
        video = _receipt(review.get('task', 'recipe-' + recipe))
        folder = ROOT / 'web/public/studio-examples' / recipe
        folder.mkdir(exist_ok=True)
        (folder / 'first-frame.png').write_bytes(Path(image['output_path']).read_bytes())
        original = folder / 'source.mp4'
        subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', video['output_path'], '-an', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(original)], check=True, timeout=120)
        selected = original
        voice = None
        voice_receipt = None
        lip_receipt = None
        if recipe in ['explain', 'presenter']:
            voice_receipt = _receipt('voice-' + recipe)
            voice = folder / 'voice.wav'
            voice.write_bytes(Path(voice_receipt['output_path']).read_bytes())
        if recipe == 'presenter':
            lip_receipt = _receipt(review.get('lip_task','lip-presenter'))
            selected = folder / 'lip-synced.mp4'
            subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', lip_receipt['output_path'], '-an', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(selected)], check=True, timeout=120)
            (folder / 'voice-padded.wav').write_bytes((WORK / 'raw/voice-presenter-padded.wav').read_bytes())
        metadata = _probe(selected)
        stream = next(item for item in metadata['streams'] if item['codec_type'] == 'video')
        duration = float(metadata['format']['duration'])
        caption_file = WORK / (recipe + '-caption.txt')
        caption_file.write_text(text['caption'], encoding='utf-8')
        escaped_caption_file = caption_file.as_posix().replace(':', '\\:')
        draw = "drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':textfile='" + escaped_caption_file + "':fontcolor=white:fontsize=22:borderw=2:bordercolor=black@0.7:x=(w-tw)/2:y=h-42"
        film = folder / 'film.mp4'
        arguments = [str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', str(selected), '-stream_loop', '-1', '-i', str(shared / 'music.mp3')]
        if voice:
            arguments.extend(['-i', str(folder / 'voice-padded.wav' if recipe == 'presenter' else voice)])
            mix = '[1:a]volume=0.12,afade=t=out:st=' + str(max(0, duration-.4)) + ':d=0.4[m];[2:a]apad[voice];[m][voice]amix=inputs=2:duration=longest:normalize=0[a]'
        else:
            mix = '[1:a]volume=0.35,afade=t=out:st=' + str(max(0, duration-.4)) + ':d=0.4[a]'
        arguments.extend(['-filter_complex', '[0:v]' + draw + '[visual];' + mix, '-map', '[visual]', '-map', '[a]', '-t', str(duration), '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(film)])
        subprocess.run(arguments, check=True, timeout=120)
        poster = folder / 'poster.jpg'
        subprocess.run([str(FFMPEG), '-nostdin', '-v', 'error', '-y', '-i', str(film), '-frames:v', '1', str(poster)], check=True, timeout=120)
        mid = lambda name: 'sample-' + recipe + '-' + name
        when = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(video['submitted_at']))
        image_take = _take(mid('image-take'), mid('image'), image['request']['prompt'], when, 'flux.2-klein-4b', image['adapter_id'], {'model': 'flux.2-klein-4b', 'seed': image['request']['metadata']['seed'], 'source_sha256': image['output_sha256']})
        video_take = _take(mid('video-take'), mid('video'), video['request']['prompt'], when, video['request']['model'], video['adapter_id'], {'model': video['request']['model'], 'seed': video['request']['metadata'].get('seed'), 'operation': video.get('operation'), 'frames': 49, 'fps': 16, 'size': '640x384', 'assets': [{'id': mid('subject'), 'versionId': mid('reference-v1'), 'mediaId': mid('image')}]})
        takes = [video_take]
        selected_take = video_take
        if lip_receipt:
            selected_take = _take(mid('lip-take'), mid('lip'), text['caption'], when, 'MuseTalk V15 CPU', lip_receipt['adapter_id'], {'operation': 'lip_sync', 'sourceMediaId': mid('video'), 'audioMediaId': mid('voice-padded'), 'actual_seconds': duration})
            takes.append(selected_take)
        nodes = [
            _node(mid('script-node'), 'text', 'Story and action', video['request']['prompt'], 0, 0, purpose='script', textMode='plain', outputText=video['request']['prompt']),
            _node(mid('image-node'), 'image', 'Replaceable subject first frame', image['request']['prompt'], 380, 0, model='flux.2-klein-4b', imageSize='512x320', status='completed', mediaId=mid('image'), selectedTakeId=image_take['id'], takes=[image_take]),
            _node(mid('video-node'), 'video', 'Main shot', video['request']['prompt'], 760, 0, model='wan2.2-ti2v-5b', resolution='640x384', ratio='5:3', seconds=3, status='completed', mediaId=selected_take['mediaId'], selectedTakeId=selected_take['id'], takes=takes),
            _node(mid('music-node'), 'audio', 'Original instrumental soundtrack', 'Original three-note arpeggio, made for the bundled editing example.', 380, 380, sourceMode='upload', status='completed', mediaId=mid('music')),
            _node(mid('assembly-node'), 'video', 'Edited sample film', 'Editable source clip, caption and original music.', 1140, 0, purpose='assembly', status='completed', mediaId=mid('film'), sourceMode='upload'),
        ]
        edges = [
            {'id': mid('text-edge'), 'source': mid('script-node'), 'sourceHandle': 'video_prompt', 'target': mid('video-node'), 'targetHandle': 'prompt'},
            {'id': mid('image-edge'), 'source': mid('image-node'), 'sourceHandle': 'image', 'target': mid('video-node'), 'targetHandle': 'first_frame'},
            {'id': mid('clip-edge'), 'source': mid('video-node'), 'sourceHandle': 'video', 'target': mid('assembly-node'), 'targetHandle': 'clip'},
            {'id': mid('music-edge'), 'source': mid('music-node'), 'sourceHandle': 'audio', 'target': mid('assembly-node'), 'targetHandle': 'soundtrack'},
        ]
        media = [_asset(mid('image'), folder/'first-frame.png', 'image/png'), _asset(mid('video'), original, 'video/mp4'), _asset(mid('film'), film, 'video/mp4'), _asset(mid('music'), shared/'music.mp3', 'audio/mpeg')]
        audio_tracks = [{'id': mid('music-track'), 'mediaId': mid('music'), 'start': 0, 'offset': 0, 'duration': duration, 'volume': .12 if voice else .35}]
        if voice:
            media.append(_asset(mid('voice'), voice, 'audio/wav'))
            voice_id = mid('voice')
            if lip_receipt:
                media.extend([_asset(mid('lip'), selected, 'video/mp4'), _asset(mid('voice-padded'), folder/'voice-padded.wav', 'audio/wav')])
                voice_id = mid('voice-padded')
            voice_takes = [_take(mid('voice-take'), mid('voice'), text['caption'], when, 'chatterbox-local', voice_receipt['adapter_id'])]
            if lip_receipt:
                voice_takes.append(_take(mid('padded-voice-take'), voice_id, text['caption'], when, 'FFmpeg silence padding', snapshot={'operation': 'silence_pad', 'sourceMediaId': mid('voice')}))
            nodes.append(_node(mid('voice-node'), 'audio', 'Editable spoken line', text['caption'], 760, 380, model='chatterbox-local', voice='default', status='completed', mediaId=voice_id, selectedTakeId=voice_takes[-1]['id'], takes=voice_takes))
            edges.append({'id': mid('voice-edge'), 'source': mid('voice-node'), 'sourceHandle': 'audio', 'target': mid('assembly-node'), 'targetHandle': 'voiceover'})
            audio_tracks.append({'id': mid('voice-track'), 'mediaId': voice_id, 'start': 0, 'offset': 0, 'duration': duration, 'volume': 1})
        shot_id = mid('shot')
        subject_type = 'human' if recipe == 'presenter' else 'animal' if recipe == 'story' else 'object'
        subject_asset = {
            'id': mid('subject'), 'kind': 'character', 'title': text['subject'],
            'prompt': image['request']['prompt'], 'mediaId': mid('image'),
            'profile': {'subjectType': subject_type, 'appearance': text['subject'], 'continuity': 'Use the first-frame design for this short example.'},
            'versions': [{'id': mid('reference-v1'), 'createdAt': when, 'prompt': image['request']['prompt'], 'mediaId': mid('image')}],
        }
        nodes[2]['data'].update(assetIds=[mid('subject')], assetVersionIds={mid('subject'): mid('reference-v1')})
        project = {
            'id': mid('project'), 'title': text['title'], 'createdAt': when, 'updatedAt': when,
            'nodes': nodes, 'edges': edges, 'assets': [subject_asset],
            'shots': [{'id': shot_id, 'title': text['title'], 'textNodeId': mid('script-node'), 'imageNodeId': mid('image-node'), 'videoNodeId': mid('video-node'), 'dialogue': text['caption'] if voice else '', 'shotCaptionText': text['caption'], 'shotCaptionDurationSeconds': duration}],
            'finalVideoNodeId': mid('assembly-node'), 'assembledMediaId': mid('film'),
            'production': {
                'documentVersion': 2, 'width': stream['width'], 'height': stream['height'], 'fps': 16, 'fit': 'letterbox', 'timelineEdited': True,
                'creativeBrief': {'recipeId': recipe, 'subject': text['subject'], 'audience': 'New video creators', 'benefit': 'One clear subject and one readable visual action', 'callToAction': ''},
                'guide': {'goal': text['goal'], 'step': 'edit'},
                'scenes': [{'id': mid('scene'), 'title': text['title'], 'description': video['request']['prompt'], 'shotIds': [shot_id], 'assetIds': [mid('subject')]}],
                'shotNarrative': {shot_id: {'purpose': text['purpose'], 'information': text['caption'], 'emotion': 'Calm and inviting', 'visualBeat': video['request']['prompt'], 'continuityNeeds': 'Keep the subject design from the approved first frame.'}},
                'approvedKeyImages': {shot_id: mid('image')},
                'timeline': [{'id': mid('clip'), 'nodeId': mid('video-node'), 'takeId': selected_take['id'], 'trimStart': 0, 'trimEnd': duration, 'caption': text['caption'], 'captionDuration': duration}],
                'audioTracks': audio_tracks,
            },
        }
        atomic_json(folder / 'project.json', project)
        notes = 'A real short visual example, not a complete 15- or 30-second campaign. The source first frame, clips, caption and sound are editable. Music is the original procedural tutorial arpeggio.'
        if video.get('operation') == 'controlled_image_edit': notes += ' This sample preserves the clean FLUX-generated subject with a precise FFmpeg image edit. The rejected native Wan attempt is not used and is not claimed as verified.'
        if voice: notes += ' Speech is post-produced with the installed Chatterbox builtin voice.'
        if lip_receipt: notes += ' MuseTalk mouth synchronization is a derived edit, not native joint audio-video generation; the silent original Take is retained.'
        source_note = 'Original local FLUX.2 Klein 4B first frame with precise FFmpeg image editing' if video.get('operation') == 'controlled_image_edit' else 'Original local FLUX.2 Klein 4B / Wan 2.2 TI2V 5B outputs'
        film_review_matches = review.get('film_reviewed') and review.get('source_sha256') == video['output_sha256'] and review.get('film_sha256') == hashlib.sha256(film.read_bytes()).hexdigest()
        sample = {'id': recipe, 'version': 1, 'duration': duration, 'width': stream['width'], 'height': stream['height'], 'film_url': '/studio-examples/' + recipe + '/film.mp4', 'poster_url': '/studio-examples/' + recipe + '/poster.jpg', 'project_url': '/studio-examples/' + recipe + '/project.json', 'source': source_note + ', edited for new-api; no third-party stock footage.', 'license': 'Original example assets. Review the model and supplied asset licenses before commercial delivery. Fictional subjects; no identity or celebrity impersonation.', 'verification': 'verified' if film_review_matches else 'needs_review', 'method': 'speech-portrait' if recipe == 'presenter' and video.get('operation') == 'controlled_image_edit' else 'image-edit' if video.get('operation') == 'controlled_image_edit' else 'native-video', 'notes': notes, 'inputs': [{'key': 'subject', 'label': 'Subject', 'value': text['subject']}, {'key': 'caption', 'label': 'Caption', 'value': text['caption']}], 'media': media}
        samples.append(sample)
        atomic_json(EVIDENCE / (recipe + '-published.json'), {'source_image_sha256': image['output_sha256'], 'source_video_sha256': video['output_sha256'], 'source_image_adapter_id': image['adapter_id'], 'source_video_adapter_id': video['adapter_id'], 'voice_adapter_id': voice_receipt['adapter_id'] if voice_receipt else None, 'lip_adapter_id': lip_receipt['adapter_id'] if lip_receipt else None, 'published_media': media, 'film_ffprobe': _probe(film), 'review': review, 'notes': notes})
    atomic_json(ROOT / 'web/public/studio-examples/manifest.json', {'version': 1, 'samples': samples})
    print('Six actual short-film projects and 11 distinct preset videos packaged; film verification follows the explicit review file.')

def verify_installed_samples():
    catalog=json.loads((ROOT/'web/public/studio-examples/manifest.json').read_text(encoding='utf-8'))
    checked=[]
    for sample in catalog['samples']:
        for asset in sample['media']:
            path=ROOT/'web/public'/asset['url'].lstrip('/')
            if path.stat().st_size != asset['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != asset['sha256']: raise RuntimeError('Published asset integrity failed: '+asset['id'])
        film=ROOT/'web/public'/sample['film_url'].lstrip('/')
        probe=_probe(film)
        video=next(stream for stream in probe['streams'] if stream['codec_type']=='video')
        if not any(stream['codec_type']=='audio' for stream in probe['streams']): raise RuntimeError('Edited sample is missing its real audio: '+sample['id'])
        if (video['width'],video['height']) != (sample['width'],sample['height']) or abs(float(probe['format']['duration'])-sample['duration'])>1/16: raise RuntimeError('Published sample metadata differs from its actual film')
        subprocess.run([str(FFMPEG),'-nostdin','-v','error','-i',str(film),'-f','null','-'],check=True,timeout=120)
        project=ROOT/'web/public'/sample['project_url'].lstrip('/')
        checked.append({'id':sample['id'],'method':sample.get('method'),'verification':sample['verification'],'film_sha256':hashlib.sha256(film.read_bytes()).hexdigest(),'project_sha256':hashlib.sha256(project.read_bytes()).hexdigest(),'assets':len(sample['media']),'all_video_audio_frames_decoded':True,'probe':probe})
    manifest=json.loads((ROOT/'web/public/studio-presets/manifest.json').read_text(encoding='utf-8'))
    preset_checks=[]
    for name in PRESET_DIRECTIONS:
        for kind in ['video','modelTest']:
            entry=manifest[name].get(kind)
            if not entry:continue
            file=ROOT/'web/public'/entry['url'].lstrip('/')
            if hashlib.sha256(file.read_bytes()).hexdigest()!=entry['sha256']:raise RuntimeError('Preset video integrity failed: '+name)
            subprocess.run([str(FFMPEG),'-nostdin','-v','error','-i',str(file),'-f','null','-'],check=True,timeout=120)
            preset_checks.append({'preset':name,'role':kind,'url':entry['url'],'sha256':entry['sha256'],'kind':entry['kind'],'verification':entry['verification']})
    atomic_json(EVIDENCE/'installed-verification.json',{'sample_count':len(checked),'samples':checked,'preset_videos':preset_checks,'timestamp':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
    print(json.dumps({'samples':len(checked),'preset_videos':len(preset_checks),'integrity_and_full_decode':'passed'}))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--task')
    parser.add_argument('--store', action='store_true', help='Generate the additional real editable coffee-store example with its own immutable plan')
    parser.add_argument('--repair', action='store_true', help='Run reviewed direction corrections using a separate immutable plan')
    parser.add_argument('--audio', action='store_true', help='Use existing offline CPU Chatterbox/MuseTalk models for the explanation and presenter samples')
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--compose-clean', action='store_true')
    parser.add_argument('--demonstrations', action='store_true')
    parser.add_argument('--verify-installed', action='store_true')
    args = parser.parse_args()
    if args.audio:
        audio_samples(); return
    if args.inspect:
        inspect_samples(); return
    if args.install:
        install_samples(); return
    if args.compose_clean:
        compose_clean_replacements(); return
    if args.demonstrations:
        create_general_demonstrations(); return
    if args.verify_installed:
        verify_installed_samples(); return
    if sum([args.store, args.repair]) > 1: parser.error('Choose one immutable inference plan')
    task_plan = plan(args.store, args.repair)
    if not args.run:
        print(json.dumps({'task_count': len(task_plan['tasks']), 'videos': sum(item['kind'] == 'video' for item in task_plan['tasks']), 'images': sum(item['kind'] == 'image' for item in task_plan['tasks'])})); return
    for task in task_plan['tasks']:
        if args.task and args.task != task['key']: continue
        previous = ''
        deadline = time.monotonic() + 1900
        while time.monotonic() < deadline:
            receipt = advance(task, task_plan['tasks'])
            status = receipt['status']
            if status != previous:
                print(json.dumps({'key': task['key'], 'status': status, 'adapter_id': receipt.get('adapter_id'), 'elapsed_sec': receipt.get('elapsed_sec')}), flush=True)
                previous = status
            if status == 'completed': break
            time.sleep(3)
        else: raise TimeoutError('Saved local task remains unfinished. Retain the receipt and query it; no automatic resubmission.')

if __name__ == '__main__': main()
