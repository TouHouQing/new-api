"""Learned relative inverse-depth video for native VACE control.

Normalize the entire sequence with the same range, rather than independently
changing every frame's contrast. This is a relative control map, not distance.
"""
import hashlib
import json
import math
import subprocess
from pathlib import Path

from studio_media_tools import artifact, validate_options


def extract_video_depth(worker, body, work):
    import numpy as np
    import torch
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation
    from install_depth_model import WEIGHT_SHA, REVISION

    options = validate_options(body)
    seconds = float(body['seconds'])
    if not math.isfinite(seconds) or not 1 <= seconds <= 30:
        raise ValueError('Depth reference supports one to thirty seconds')
    width, height = int(options.get('width', 384)), int(options.get('height', 224))
    if f'{width}x{height}' not in {'640x384', '384x640', '640x480', '480x640', '512x512', '384x224', '224x384'}:
        raise ValueError('Choose a supported VACE resolution for the depth reference')
    if seconds > 10 and f'{width}x{height}' not in {'384x224', '224x384'}:
        raise ValueError('Long depth references use 384x224 or 224x384 on this workstation')
    reference = next((item for item in body.get('references', []) if item.get('type') == 'video'), None)
    if reference is None: raise ValueError('Select a stored video reference')
    source = worker.reference(reference, work / 'source.mp4')
    probe = Path(worker.ffmpeg).with_name('ffprobe' + Path(worker.ffmpeg).suffix)
    info = json.loads(subprocess.run([str(probe), '-v', 'error', '-show_format', '-of', 'json', str(source)], check=True, capture_output=True, timeout=30).stdout)
    duration = float(info.get('format', {}).get('duration', 0))
    if not math.isfinite(duration) or duration < seconds - .1:
        raise ValueError('Reference video is shorter than the requested depth interval')
    frames = math.ceil(seconds * 16 / 4) * 4 + 1
    inputs, predictions, outputs = work / 'depth-inputs', work / 'depth-predictions', work / 'depth-frames'
    for path in [inputs, predictions, outputs]: path.mkdir(exist_ok=True)
    if len(list(inputs.glob('*.png'))) != frames:
        filters = f'fps=16,scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},tpad=stop_mode=clone:stop_duration=1'
        subprocess.run([worker.ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(source), '-vf', filters, '-frames:v', str(frames), str(inputs / '%05d.png')], check=True, timeout=120, stderr=subprocess.PIPE)
    model_path = worker.root.parent / 'depth-models' / 'depth-anything-v2-small'
    checkpoint = model_path / 'model.safetensors'
    if not checkpoint.is_file(): raise ValueError('Install the pinned Depth Anything V2 Small checkpoint first')
    if hashlib.sha256(checkpoint.read_bytes()).hexdigest() != WEIGHT_SHA:
        raise ValueError('Depth model checkpoint checksum differs')
    torch.set_num_threads(6)
    processor = AutoImageProcessor.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False)
    model = AutoModelForDepthEstimation.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False).eval()
    samples = []
    for image_path in sorted(inputs.glob('*.png')):
        prediction_path = predictions / (image_path.stem + '.npy')
        if prediction_path.is_file():
            prediction = np.load(prediction_path, allow_pickle=False)
        else:
            image = Image.open(image_path).convert('RGB')
            values = processor(images=image, return_tensors='pt')
            with torch.inference_mode():
                raw = model(**values).predicted_depth
                prediction = torch.nn.functional.interpolate(raw.unsqueeze(1), size=(height, width), mode='bicubic', align_corners=False).squeeze().cpu().numpy()
            np.save(prediction_path, prediction, allow_pickle=False)
        if prediction.shape != (height, width) or not np.isfinite(prediction).all():
            raise RuntimeError('Depth model returned invalid pixels')
        samples.append(prediction[::8, ::8].reshape(-1))
    low, high = np.percentile(np.concatenate(samples), [1, 99])
    if not high > low + 1e-6: raise RuntimeError('Depth model returned a constant reference')
    for index, prediction_path in enumerate(sorted(predictions.glob('*.npy'))):
        if index >= frames: break
        prediction = np.load(prediction_path, allow_pickle=False)
        image = Image.fromarray(np.clip((prediction - low) * 255 / (high - low), 0, 255).astype('uint8')).convert('RGB')
        image.save(outputs / f'{index + 1:05d}.png')
        if index == frames // 2: image.save(work / 'depth-preview.png')
    output = work / 'depth-reference.mp4'
    subprocess.run([worker.ffmpeg, '-nostdin', '-v', 'error', '-y', '-framerate', '16', '-i', str(outputs / '%05d.png'), '-frames:v', str(frames), '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], check=True, timeout=120, stderr=subprocess.PIPE)
    metadata = {'model': 'depth-anything-v2-small', 'revision': REVISION, 'checkpoint_sha256': WEIGHT_SHA, 'reference_control': 'depth', 'depth_type': 'relative_inverse_depth', 'frames': frames, 'fps': 16, 'width': width, 'height': height, 'source_duration': duration, 'normalization': {'lower': float(low), 'upper': float(high)}}
    (work / 'depth-receipt.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
    return {'path': str(output), 'seconds': frames / 16, 'output': {'type': 'video', 'mime_type': 'video/mp4'}, 'metadata': metadata, 'artifacts': [artifact('output', output, 'video', 'video/mp4'), artifact('depth_preview', work / 'depth-preview.png', 'image', 'image/png')]}
