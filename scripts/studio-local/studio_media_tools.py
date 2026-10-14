"""Actual local image and audio processing behind the durable media worker.

Model engines are loaded on demand. A failed model never returns a placeholder.
All inputs and output paths stay in the owning job's directory.
"""
import base64
import hashlib
import io
import json
import math
import subprocess
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from studio_inference_lease import gpu_lease
from studio_comfy_receipts import save_receipt, find_prompt


IMAGE_ACTIONS = {'image_bg_remove', 'image_upscale', 'image_outpaint', 'image_layers', 'image_grid', 'image_to_3d'}
AUDIO_ACTIONS = {'audio_separate', 'audio_translate'}


def validate_options(body):
    options = body.get('options') or {}
    if not isinstance(options, dict):
        raise ValueError('Invalid tool options')
    limits = {'width': (16, 2048), 'height': (16, 2048), 'scale': (1, 4), 'rows': (1, 4), 'columns': (1, 4), 'speed': (.5, 2), 'pitch': (-12, 12), 'pause': (0, 3), 'expression': (0, 2)}
    for key, value in options.items():
        if key == 'panel_prompts':
            if body.get('operation') != 'image_grid' or not isinstance(value, list) or not 1 <= len(value) <= 16 or any(not isinstance(p, str) or not p.strip() or len(p) > 3000 for p in value): raise ValueError('Describe every storyboard panel')
            continue
        if key in {'redo_panel', 'repair_start', 'repair_end', 'candidate_start', 'candidate_end'}:
            panel = key == 'redo_panel'
            if (body.get('operation') != 'image_grid' if panel else body.get('operation') not in {'music','audio_separate'}) or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not (1 if panel else 0) <= value <= (16 if panel else 30 if body.get('operation')=='music' else 600) or panel and int(value) != value: raise ValueError('Invalid repair interval or panel')
            continue
        if key in {'outpaint_mode', 'mask_source', 'background_prompt'}:
            if key == 'outpaint_mode' and (body.get('operation') != 'image_outpaint' or value not in {'strict', 'natural'}) or key == 'mask_source' and (body.get('operation') != 'image_layers' or value not in {'automatic', 'second_reference'}) or key == 'background_prompt' and (body.get('operation') != 'image_layers' or not isinstance(value, str) or len(value) > 2000): raise ValueError('Invalid image reconstruction option')
            continue
        if key in {'music_mode', 'lyrics', 'bpm', 'seed'}:
            if body.get('operation') != 'music': raise ValueError('Music parameters require a music task')
            if key == 'music_mode' and value not in {'instrumental', 'song'}: raise ValueError('Unsupported music mode')
            if key == 'lyrics' and (not isinstance(value, str) or len(value) > 3000): raise ValueError('Lyrics exceed the local limit')
            if key in {'bpm', 'seed'} and (isinstance(value, bool) or not isinstance(value, int) or not (30 if key == 'bpm' else 0) <= value <= (240 if key == 'bpm' else 2147483647)): raise ValueError('Invalid music tempo or seed')
            continue
        if key in {'translation', 'negative'}:
            if not isinstance(value, str) or len(value) > 3000: raise ValueError('Translation exceeds the local limit')
            continue
        if key not in limits or isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError('Unsupported or invalid tool option')
        if not limits[key][0] <= value <= limits[key][1]: raise ValueError('Tool option is outside the supported range')
        if key in {'width', 'height', 'scale', 'rows', 'columns'} and int(value) != value: raise ValueError('Image dimensions must be whole numbers')
    if options.get('panel_prompts') and len(options['panel_prompts']) != options.get('rows', 2) * options.get('columns', 2): raise ValueError('Panel plan must match the grid')
    if options.get('redo_panel') and options['redo_panel'] > options.get('rows', 2) * options.get('columns', 2): raise ValueError('Repair panel exceeds the grid')
    if 'repair_start' in options or 'repair_end' in options:
        start, end = options.get('repair_start'), options.get('repair_end')
        if body.get('operation')=='music' and options.get('music_mode') != 'song' or start is None or end is None or end <= start or end - start > float(body.get('seconds', 0)) + .001: raise ValueError('Song repair interval must fit the generation duration')
    if 'candidate_start' in options or 'candidate_end' in options or body.get('operation')=='audio_separate' and 'repair_end' in options:
        start,end=options.get('candidate_start'),options.get('candidate_end')
        if body.get('operation')!='audio_separate' or options.get('repair_end') is None or start is None or end is None or end <= start: raise ValueError('Select a valid candidate audio interval')
    if options.get('music_mode') == 'song' and not options.get('lyrics', '').strip(): raise ValueError('Song mode requires lyrics')
    if options.get('music_mode') == 'song':
        import re
        lines = [line for line in options['lyrics'].splitlines() if line.strip() and not re.fullmatch(r'\s*\[[^\]]+\]\s*', line)]
        if max(8, math.ceil(4 + sum(.75 + len(re.findall(r'[\u3400-\u9fff]|[^\W\d_]+', line)) * .65 for line in lines))) > 30: raise ValueError('Split lyrics into shorter sections for the thirty-second song limit')
    if options.get('music_mode') != 'song' and options.get('lyrics'): raise ValueError('Instrumental mode does not accept lyrics')
    return options


def artifact(key, path, kind, mime):
    return {'key': key, 'type': kind, 'mime_type': mime, 'path': str(path)}


def flux(worker, prompt, size, work, references=()):
    # Generate at the workstation's supported size and restore the requested
    # canvas size before composing; original pixels remain exact in outpaint.
    scale = min(1, 1024 / max(size))
    native = tuple(max(64, round(value * scale / 16) * 16) for value in size)
    body = {'model': 'flux.2-klein-4b', 'prompt': prompt, 'size': f'{native[0]}x{native[1]}', 'n': 1, 'response_format': 'b64_json'}
    if references:
        body['images'] = ['data:image/png;base64,' + base64.b64encode(value).decode() for value in references]
    path = work / 'flux-receipt.json'
    if path.is_file():
        receipt = json.loads(path.read_text())
        frozen = receipt['request']
        parameters = {key: value for key, value in frozen.items() if key not in {'idempotency_key', 'seed'}}
        if parameters != body: raise ValueError('The saved image request differs from the immutable tool input')
        # Retain the original nonce and seed across upgrades and lost responses.
        body = frozen
    else:
        key = hashlib.sha256((work.parent.name + '/' + work.name + json.dumps(body, sort_keys=True)).encode()).hexdigest()
        body.update({'idempotency_key': key, 'seed': int(key[:8], 16) % (2**31)})
        receipt = {'request': body}
    save_receipt(path, receipt)
    # Repeating this POST retrieves the same SQLite record, including when the
    # first response was lost before the worker could persist its returned ID.
    if not receipt.get('id'):
        result = worker.request('http://127.0.0.1:13003/studio-local/v1/images/jobs', body)
        receipt['id'] = result['id']; save_receipt(path, receipt)
    endpoint = 'http://127.0.0.1:13003/studio-local/v1/images/jobs/' + receipt['id']
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        result = worker.request(endpoint)
        if result['status'] == 'failed': raise RuntimeError(result.get('error') or 'FLUX inference failed')
        if result['status'] == 'uncertain' and not result.get('prompt_id'): raise RuntimeError('FLUX submission is unresolved; preserve the saved receipt and inspect ComfyUI')
        if result['status'] == 'completed':
            with urlopen(endpoint + '/content', timeout=60) as response: data = response.read()
            break
        time.sleep(1)
    else: raise TimeoutError('FLUX inference is incomplete; retain the saved image receipt')
    from PIL import Image
    return Image.open(io.BytesIO(data)).convert('RGB')


def upscale(worker, image, output, scale):
    from PIL import Image
    stream = io.BytesIO()
    image.convert('RGB').save(stream, format='PNG')
    boundary, name = 'studio-' + uuid.uuid4().hex, uuid.uuid4().hex + '.png'
    raw = (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: image/png\r\n\r\n').encode() + stream.getvalue() + (f'\r\n--{boundary}--\r\n').encode()
    with gpu_lease(worker.root.parent):
        path = output.parent / 'upscale-receipt.json'
        signature = hashlib.sha256(stream.getvalue() + str(scale).encode() + worker.comfy.encode()).hexdigest()
        saved = json.loads(path.read_text()) if path.is_file() else {}
        if saved and saved.get('signature') != signature: raise ValueError('The saved upscale source differs')
        receipt = saved.get('prompt_id')
        if saved and not receipt:
            receipt = find_prompt(worker.request, worker.comfy, output.parent.name + '-upscale')
            if not receipt: raise RuntimeError('Upscale submission is unresolved; inspect its saved request before retrying')
        if not saved:
            pending = worker.request(worker.comfy + '/queue')
            if pending.get('queue_running') or pending.get('queue_pending'): raise ValueError('ComfyUI is busy; wait for the existing request')
            with urlopen(Request(worker.comfy + '/upload/image', data=raw, headers={'Content-Type': 'multipart/form-data; boundary=' + boundary}), timeout=60) as response:
                upload = json.load(response)
            graph = {
            '1': {'class_type': 'LoadImage', 'inputs': {'image': '/'.join(filter(None, [upload.get('subfolder'), upload['name']]))}},
            '2': {'class_type': 'UpscaleModelLoader', 'inputs': {'model_name': 'RealESRGAN_x4plus.pth'}},
            '3': {'class_type': 'ImageUpscaleWithModel', 'inputs': {'upscale_model': ['2', 0], 'image': ['1', 0]}},
            '4': {'class_type': 'SaveImage', 'inputs': {'images': ['3', 0], 'filename_prefix': 'studio-tools/' + name[:-4]}},
            }
            save_receipt(path, {'signature': signature, 'stage': 'submitting'})
            receipt = worker.request(worker.comfy + '/prompt', {'prompt': graph, 'extra_data': {'studio_request_id': output.parent.name + '-upscale'}})['prompt_id']
        save_receipt(path, {'signature': signature, 'prompt_id': receipt})
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            result = worker.request(worker.comfy + '/history/' + receipt).get(receipt)
            if not result:
                time.sleep(1)
                continue
            if result.get('status', {}).get('status_str') == 'error': raise RuntimeError('Real-ESRGAN inference failed')
            items = [item for key, value in result.get('outputs', {}).items() if result.get('prompt', [None, None, {}])[2].get(key, {}).get('class_type') == 'SaveImage' for item in value.get('images', []) if item.get('type') == 'output']
            if not items: raise RuntimeError('Real-ESRGAN returned no image')
            with urlopen(worker.comfy + '/view?' + urlencode(items[0]), timeout=60) as response:
                restored = Image.open(io.BytesIO(response.read())).convert('RGBA')
            restored = restored.resize((image.width * scale, image.height * scale), Image.Resampling.LANCZOS)
            if image.mode == 'RGBA': restored.putalpha(image.getchannel('A').resize(restored.size, Image.Resampling.LANCZOS))
            restored.save(output)
            return receipt
        raise TimeoutError('Real-ESRGAN inference did not finish; inspect the ComfyUI receipt ' + receipt)


def blend_outpaint_source(generated, source, offset, pixels=32):
    from PIL import Image
    import numpy as np
    # Interior pixels remain exact. Only the documented boundary can change.
    y, x = np.indices((source.height, source.width))
    distance = np.minimum.reduce([x + 1, y + 1, source.width - x, source.height - y])
    alpha = Image.fromarray(np.minimum(255, distance / pixels * 255).astype('uint8'))
    result = generated.convert('RGBA')
    result.paste(source.convert('RGBA'), offset, alpha)
    return result


def storyboard_quality(cells, directions):
    import numpy as np
    hashes = []
    for cell in cells:
        sample = np.asarray(cell.convert('L').resize((16, 16)), dtype=float)
        hashes.append(sample > sample.mean())
    pairs = []
    for i in range(len(cells)):
        for j in range(i + 1, len(cells)):
            distance = int(np.count_nonzero(hashes[i] != hashes[j]))
            if distance <= 12: pairs.append({'first': i + 1, 'second': j + 1, 'distance': distance})
    return {'status': 'review_required' if pairs else 'generated', 'warnings': ['Similar panels need review. Change their action or framing and redo only that panel.'] if pairs else ['Check identity and shot intent before approval.'], 'similar_pairs': pairs, 'panels': [{'number': i + 1, 'direction': prompt} for i, prompt in enumerate(directions)]}


def layer_removal_mask(mask, automatic):
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
    removal = ((np.array(mask.filter(ImageFilter.MaxFilter(15))) > 20) * 255).astype('uint8')
    if not removal.any(): raise ValueError('The removal mask is empty; select the foreground manually')
    if automatic:
        # Segmentation holes and disconnected tails must not survive as background.
        bounds = Image.fromarray(removal).getbbox()
        result = Image.new('L', mask.size)
        padding = max(8, round(max(mask.size) * .12))
        ImageDraw.Draw(result).rectangle((max(0, bounds[0] - padding), max(0, bounds[1] - padding), min(mask.width - 1, bounds[2] + padding), min(mask.height - 1, bounds[3] + padding)), fill=255)
        removal = np.asarray(result)
    return removal


def image_tool(worker, body, work):
    from PIL import Image, ImageFilter
    action, options = body['operation'], validate_options(body)
    reference = next((item for item in body.get('references', []) if item['type'] == 'image'), None)
    image = None
    if reference:
        image = Image.open(worker.reference(reference, work / 'source.bin'))
        if image.width * image.height > 16_777_216: raise ValueError('Resize the reference to at most sixteen megapixels')
        image.load()
        image = image.convert('RGBA')
    if action != 'image_grid' and image is None: raise ValueError('Select an image reference')
    output, artifacts, metadata = work / 'output.png', [], {}
    if action in {'image_bg_remove', 'image_layers', 'image_to_3d'}:
        if action == 'image_layers' and options.get('mask_source') == 'second_reference':
            foreground = image.copy()
        else:
            from rembg import new_session, remove
            foreground = remove(image, session=new_session('u2netp'), alpha_matting=False)
        foreground.save(output)
        if action == 'image_layers':
            import cv2
            import numpy as np
            images = [item for item in body.get('references', []) if item['type'] == 'image']
            if options.get('mask_source') == 'second_reference':
                if len(images) != 2: raise ValueError('Choose the source image and a white removal mask')
                mask_image = Image.open(worker.reference(images[1], work / 'mask.bin')).convert('L')
                if mask_image.size != image.size: raise ValueError('Removal mask must match the source image dimensions')
                mask = mask_image
                foreground = image.copy()
                foreground.putalpha(mask)
            else:
                mask = foreground.getchannel('A')
            removal = layer_removal_mask(mask, options.get('mask_source') != 'second_reference')
            source = np.array(image.convert('RGB'))
            # The model receives a background with the subject already removed.
            # Neither the character prompt nor the original foreground can bring it back.
            repaired = Image.fromarray(cv2.inpaint(source, removal, 5, cv2.INPAINT_TELEA))
            original = io.BytesIO(); repaired.save(original, format='PNG')
            background = flux(worker, 'An empty environment matching the reference background. Keep its exact rendering style, colors and lighting, continuous natural textures. No people, animals, objects in the removed foreground, portraits, silhouettes or text. ' + options.get('background_prompt', ''), image.size, work, [original.getvalue()]).resize(image.size)
            blend = Image.fromarray(removal).filter(ImageFilter.GaussianBlur(4))
            background = Image.composite(background, image.convert('RGB'), blend)
            background_path, foreground_path, mask_path = work / 'background.png', work / 'foreground.png', work / 'removal-mask.png'
            background.save(background_path); foreground.save(foreground_path); Image.fromarray(removal).save(mask_path)
            composed = background.convert('RGBA'); composed.alpha_composite(foreground); composed.save(output)
            similarity = float(np.mean(np.abs(np.array(background).astype(float)[removal > 0] - source.astype(float)[removal > 0])) / 255)
            quality = {'status': 'review_required', 'warnings': ['Inspect the background with the foreground hidden before approving.'], 'foreground_residual_similarity': round(1 - similarity, 4), 'mask_source': options.get('mask_source', 'automatic')}
            quality_path = work / 'quality-report.json'; save_receipt(quality_path, quality)
            artifacts.extend([artifact('background', background_path, 'image', 'image/png'), artifact('foreground', foreground_path, 'image', 'image/png'), artifact('removal-mask', mask_path, 'image', 'image/png'), artifact('quality_report', quality_path, 'file', 'application/json')])
        if action == 'image_to_3d':
            from studio_mesh_generation import reconstruct
            mesh = work / 'mesh.glb'
            reconstruct(worker.root.parent, foreground, mesh)
            artifacts.append(artifact('mesh', mesh, 'file', 'model/gltf-binary'))
    elif action == 'image_upscale':
        scale = int(options.get('scale', 2))
        if image.width * scale > 8192 or image.height * scale > 8192: raise ValueError('Upscaled image exceeds the output limit')
        metadata['prompt_id'] = upscale(worker, image, output, scale)
    elif action == 'image_outpaint':
        size = (int(options.get('width', 1024)), int(options.get('height', 1024)))
        if size[0] < image.width or size[1] < image.height: raise ValueError('Outpaint dimensions must contain the original image')
        reference = io.BytesIO()
        image.save(reference, format='PNG')
        generated = flux(worker, 'Extend the surroundings beyond this image while keeping its subject and visual style. ' + body['prompt'], size, work, [reference.getvalue()]).resize(size).convert('RGBA')
        offset = ((size[0] - image.width) // 2, (size[1] - image.height) // 2)
        mode = options.get('outpaint_mode', 'strict')
        if mode == 'natural':
            generated = blend_outpaint_source(generated, image, offset)
        else:
            generated.paste(image, offset)
        generated.save(output)
        metadata['source_bounds'] = {'x': offset[0], 'y': offset[1], 'width': image.width, 'height': image.height}
        quality_path = work / 'quality-report.json'
        save_receipt(quality_path, {'status': 'review_required', 'mode': mode, 'source_bounds': metadata['source_bounds'], 'blend_pixels': 32 if mode == 'natural' else 0, 'warnings': ['Inspect the source boundary. Strict mode preserves every original pixel; natural mode blends the outer 32 pixels.']})
        artifacts.append(artifact('quality_report', quality_path, 'file', 'application/json'))
    elif action == 'image_grid':
        rows, columns = int(options.get('rows', 2)), int(options.get('columns', 2))
        size = (int(options.get('width', 1024)), int(options.get('height', 1024)))
        directions = options.get('panel_prompts') or ['Wide establishing shot: introduce the location', 'Medium shot: the character takes action', 'Close-up: show a reaction or important detail', 'Wide closing shot: reveal the outcome']
        if 'panel_prompts' not in options: directions = [directions[i % 4] for i in range(rows * columns)]
        references = []
        if image:
            stream = io.BytesIO(); image.save(stream, format='PNG'); references = [stream.getvalue()]
        redo = options.get('redo_panel')
        previous = None
        if redo:
            images = [item for item in body.get('references', []) if item['type'] == 'image']
            if len(images) != 2: raise ValueError('Choose the source image and the original grid')
            previous = Image.open(worker.reference(images[1], work / 'original-grid.bin')).convert('RGB')
            if previous.size != size: raise ValueError('The original grid dimensions differ; keep the saved grid layout')
        generated = Image.new('RGB', size)
        cells = []
        for index in range(rows * columns):
            row, column = divmod(index, columns)
            bounds = (column * size[0] // columns, row * size[1] // rows, (column + 1) * size[0] // columns, (row + 1) * size[1] // rows)
            cell_size = (bounds[2] - bounds[0], bounds[3] - bounds[1])
            cell_work = work / f'panel-{index + 1}'; cell_work.mkdir(exist_ok=True)
            if redo and index + 1 != redo:
                cell = previous.crop(bounds)
            else:
                cell = flux(worker, 'Create ONE cinematic storyboard shot, no contact sheet, borders, captions or text. Keep character identity, costume and location consistent with the reference. Story: ' + body['prompt'] + '. THIS SHOT ONLY: ' + directions[index], cell_size, cell_work, references).resize(cell_size)
            target = work / f'cell-{index + 1}.png'; cell.save(target)
            generated.paste(cell, bounds[:2]); cells.append(cell)
            artifacts.append(artifact(target.stem, target, 'image', 'image/png'))
            if index == 0 and not references:
                anchor = io.BytesIO(); cell.save(anchor, format='PNG'); references = [anchor.getvalue()]
        generated.save(output)
        quality_path = work / 'quality-report.json'
        save_receipt(quality_path, storyboard_quality(cells, directions))
        artifacts.append(artifact('quality_report', quality_path, 'file', 'application/json'))
        metadata['operations'] = 1 if redo else rows * columns
    else:
        raise ValueError('Unsupported image tool')
    return {'path': str(output), 'output': {'type': 'image', 'mime_type': 'image/png'}, 'artifacts': [artifact('output', output, 'image', 'image/png'), *artifacts], 'seconds': 1, 'operations': 1, **metadata}


def audio_tool(worker, body, work):
    import numpy as np
    import soundfile as sf
    options = validate_options(body)
    if body['operation']=='audio_separate' and options.get('repair_end') is not None:
        from studio_lyrics import repair_song
        output=work/'output.wav'; repair_song(worker,work.name,body,output)
        report=work/'repair-manifest.json'; manifest=json.loads(report.read_text()); save_receipt(report,{**manifest,'status':'review_required','warnings':['User-selected candidate vocals were fitted to the chosen interval. Review the transition before delivery.']})
        return {'path':str(output),'output':{'type':'audio','mime_type':'audio/wav'},'seconds':manifest['processing_seconds'],'artifacts':[artifact('output',output,'audio','audio/wav'),artifact('quality_report',report,'file','application/json')]}
    reference = next(item for item in body['references'] if item['type'] == 'audio')
    source = worker.reference(reference, work / 'source.bin')
    converted = work / 'source.wav'
    probe = subprocess.check_output([str(Path(worker.ffmpeg).with_name('ffprobe' + Path(worker.ffmpeg).suffix)), '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(source)], timeout=30)
    if not .1 <= float(probe) <= 600: raise ValueError('Split audio into sources of at most ten minutes')
    subprocess.run([worker.ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vn', '-ar', '44100', '-ac', '2', str(converted)], check=True, timeout=120, stderr=subprocess.PIPE)
    info = sf.info(converted)
    if not .1 <= info.duration <= 600: raise ValueError('Audio tools support up to ten minutes per source')
    output, metadata, artifacts = work / 'output.wav', {}, []
    if body['operation'] == 'audio_separate':
        import torch
        from demucs.apply import apply_model
        from demucs.pretrained import get_model
        torch.set_num_threads(6)
        model = get_model('htdemucs').eval()
        signal, rate = sf.read(converted, dtype='float32', always_2d=True)
        waveform = torch.from_numpy(signal.T.copy())
        mean, deviation = waveform.mean(), waveform.std().clamp_min(1e-5)
        with torch.inference_mode():
            separated = apply_model(model, ((waveform - mean) / deviation)[None], device='cpu', shifts=0, split=True, overlap=.25, progress=False)[0] * deviation + mean
        stems = {name: separated[index].T.numpy() for index, name in enumerate(model.sources)}
        sf.write(output, stems['vocals'], rate, subtype='PCM_16')
        instrumental = sum(value for name, value in stems.items() if name != 'vocals')
        stems['instrumental'] = instrumental
        for name, signal in stems.items():
            if name == 'vocals': continue
            target = work / (name + '.wav')
            sf.write(target, signal, rate, subtype='PCM_16')
            artifacts.append(artifact(name, target, 'audio', 'audio/wav'))
        del model, waveform, separated
    else:
        from studio_audio_localization import localize_audio
        metadata, artifacts = localize_audio(worker, body, converted, output, options, info.duration)
    signal, _ = sf.read(output, dtype='float32')
    if not np.isfinite(signal).all(): raise ValueError('Processed audio contains invalid samples')
    return {'path': str(output), 'output': {'type': 'audio', 'mime_type': 'audio/wav'}, 'seconds': sf.info(output).duration, 'artifacts': [artifact('output', output, 'audio', 'audio/wav'), *artifacts], **metadata}
