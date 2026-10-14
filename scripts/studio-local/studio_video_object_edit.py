"""VACE video inpainting for an explicitly selected object region and interval.

The original video remains immutable. Saved inference receipts are reused when
collecting a finished edit, and source sound and unselected intervals survive.
"""
import base64
import json
import math
import subprocess
import time
from pathlib import Path


VIDEO_ACTIONS = {'video_remove', 'video_replace'}


def validate_edit(body):
    edit = body.get('edit')
    if not isinstance(edit, dict): raise ValueError('Select an object region and time interval')
    for key in ['start', 'end', 'x', 'y', 'width', 'height']:
        value = edit.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): raise ValueError('Invalid object edit coordinates')
    if not 0 <= edit['start'] < edit['end'] <= 3600 or not 0 < edit['end'] - edit['start'] <= 30:
        raise ValueError('Select an interval of at most thirty seconds')
    if edit['x'] < 0 or edit['y'] < 0 or edit['width'] < 2 or edit['height'] < 2 or any(int(edit[k]) != edit[k] for k in ['x', 'y', 'width', 'height']):
        raise ValueError('Select a positive object region in source pixels')
    if body.get('operation') == 'video_replace' and not str(body.get('prompt', '')).strip(): raise ValueError('Describe the replacement object')
    if not any(item.get('type') == 'video' for item in body.get('references', [])): raise ValueError('Select a stored source video')
    return edit


def edit_video_object(worker, body, work):
    from PIL import Image, ImageDraw
    edit = validate_edit(body)
    source = worker.reference(next(item for item in body['references'] if item['type'] == 'video'), work / 'source.bin')
    probe = json.loads(subprocess.check_output([str(Path(worker.ffmpeg).with_name('ffprobe' + Path(worker.ffmpeg).suffix)), '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(source)], timeout=60))
    video = next(item for item in probe['streams'] if item['codec_type'] == 'video')
    width, height = video['width'], video['height']
    from fractions import Fraction
    try: fps = float(Fraction(video.get('avg_frame_rate', '24')))
    except (ValueError, ZeroDivisionError): fps = 24
    if not math.isfinite(fps) or not 1 <= fps <= 120: fps = 24
    duration = float(probe['format']['duration'])
    if edit['end'] > duration + .01 or edit['x'] + edit['width'] > width or edit['y'] + edit['height'] > height: raise ValueError('Object edit exceeds the source video')
    if width * height > 4096 * 2160: raise ValueError('Resize the source before object editing')
    seconds = edit['end'] - edit['start']
    model_size = (640, 384) if width >= height else (384, 640)
    if seconds > 10: model_size = (384, 224) if width >= height else (224, 384)
    frames = min(481, math.ceil(seconds * 16 / 4) * 4 + 1)
    clip = work / 'condition.mp4'
    subprocess.run([worker.ffmpeg, '-nostdin', '-y', '-v', 'error', '-ss', str(edit['start']), '-t', str(seconds), '-i', str(source), '-vf', f'drawbox=x={edit["x"]}:y={edit["y"]}:w={edit["width"]}:h={edit["height"]}:color=0x7f7f7f:t=fill,scale={model_size[0]}:{model_size[1]},fps=16,tpad=stop_mode=clone:stop_duration=1', '-frames:v', str(frames), '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(clip)], check=True, timeout=120, stderr=subprocess.PIPE)
    mask = Image.new('L', (width, height))
    ImageDraw.Draw(mask).rectangle((edit['x'], edit['y'], edit['x'] + edit['width'] - 1, edit['y'] + edit['height'] - 1), fill=255)
    mask.save(work / 'source-mask.png')
    mask.resize(model_size, Image.Resampling.NEAREST).save(work / 'model-mask.png')
    mask_video = work / 'condition-mask.mp4'
    subprocess.run([worker.ffmpeg, '-nostdin', '-y', '-v', 'error', '-loop', '1', '-i', str(work / 'model-mask.png'), '-r', '16', '-frames:v', str(frames), '-an', '-c:v', 'libx264', '-crf', '0', '-pix_fmt', 'yuv420p', str(mask_video)], check=True, timeout=120, stderr=subprocess.PIPE)
    def reference(path, role, kind, mime):
        return {'type': kind, 'role': role, kind: {'url': 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode()}}
    content = [reference(clip, 'source_video', 'video_url', 'video/mp4'), reference(mask_video, 'mask_video', 'video_url', 'video/mp4')]
    replacement = next((item for item in body['references'] if item['type'] == 'image'), None)
    if replacement:
        image = worker.reference(replacement, work / 'replacement.png')
        content.append(reference(image, 'reference_image', 'image_url', 'image/png'))
    prompt = 'The same scene with an empty coherent background in the selected region, natural camera motion and stable lighting. ' if body['operation'] == 'video_remove' else 'The replacement subject in the original scene, with consistent lighting, scene motion and camera. '
    receipt_path = work / 'inference-receipt.json'
    if receipt_path.is_file():
        receipt = json.loads(receipt_path.read_text())
    else:
        receipt = worker.request('http://127.0.0.1:13003/v1/videos', {'model': 'wan2.1-vace-1.3b', 'prompt': prompt + body['prompt'], 'seconds': max(1, seconds), 'size': f'{model_size[0]}x{model_size[1]}', 'metadata': {'frames': frames, 'content': content, 'negative': (body.get('options') or {}).get('negative', 'blurry, low quality, distorted anatomy, text, watermark')}})
        temporary = receipt_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(receipt))
        temporary.replace(receipt_path)
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        task = worker.request('http://127.0.0.1:13003/v1/videos/' + receipt['id'])
        if task['status'] == 'completed': break
        if task['status'] in {'failed', 'cancelled'}: raise RuntimeError('Object edit inference failed: ' + str(task.get('error')))
        time.sleep(2)
    else: raise TimeoutError('Object edit is still running; retain and collect the saved inference receipt')
    from urllib.request import urlopen
    generated = work / 'generated.mp4'
    with urlopen('http://127.0.0.1:13003/v1/videos/' + receipt['id'] + '/content', timeout=60) as response: generated.write_bytes(response.read())
    # Merge only the explicit mask. Original sound and the intervals before and
    # after the edit come from the original source, not a generated soundtrack.
    filters = [f'[1:v]trim=duration={seconds},setpts=PTS-STARTPTS+{edit["start"]}/TB,scale={width}:{height},crop={edit["width"]}:{edit["height"]}:{edit["x"]}:{edit["y"]}[replacement]', f'[0:v][replacement]overlay=x={edit["x"]}:y={edit["y"]}:enable=\'gte(t,{edit["start"]})*lt(t,{edit["end"]})\':eof_action=pass:repeatlast=0[out]']
    output = work / 'output.mp4'
    subprocess.run([worker.ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(source), '-i', str(generated), '-filter_complex', ';'.join(filters), '-map', '[out]', '-map', '0:a?', '-r', str(fps), '-t', str(duration), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-avoid_negative_ts', 'disabled', '-movflags', '+faststart', str(output)], check=True, timeout=600, stderr=subprocess.PIPE)
    return {'path': str(output), 'seconds': seconds, 'output': {'type': 'video', 'mime_type': 'video/mp4'}, 'metadata': {'source_duration': duration, 'inference_id': receipt['id'], 'prompt_id': task.get('metadata', {}).get('prompt_id'), 'edit': edit, 'source_audio_preserved': True}}
