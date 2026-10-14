"""Preserve explicitly timed reference images in a real generated video."""
import io
import json
import hashlib
import subprocess
from pathlib import Path


def preserve_video_frames(path, references, values, ffmpeg):
    import numpy as np
    from PIL import Image, ImageOps
    from studio_comfy_receipts import save_receipt
    width, height, count, fps = (values[key] for key in ['width', 'height', 'frames', 'fps'])
    if not ffmpeg or fps != 16 or not 5 <= count <= 481 or not all(64 <= size <= 1024 and size % 16 == 0 for size in [width, height]):
        raise ValueError('Timed frame preservation needs the configured local VACE dimensions and FFmpeg')
    anchors = {}
    for role, (raw, mime) in references.items():
        index = 0 if role == 'first_frame' else count - 1 if role == 'last_frame' else int(role.split(':')[1]) if role.startswith('key_frame:') else None
        if index is None:
            continue
        if not 0 <= index < count or not mime.startswith('image/') or index in anchors:
            raise ValueError('Timed frame indices must be unique and within the video')
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 32_000_000:
            raise ValueError('Reference frame exceeds the supported pixel budget')
        anchors[index] = np.asarray(ImageOps.fit(image.convert('RGB'), (width, height), method=Image.Resampling.LANCZOS)).copy()
    if not anchors:
        return {}
    path = Path(path)
    original = path.with_name(path.stem + '-generated.mp4')
    proof = path.with_name(path.stem + '-keyframes.json')
    signature = hashlib.sha256(json.dumps(values, sort_keys=True).encode() + b''.join(str(i).encode() + anchors[i].tobytes() for i in sorted(anchors))).hexdigest()
    if proof.is_file() and path.is_file():
        previous = json.loads(proof.read_text())
        if previous['signature'] != signature:
            raise ValueError('Saved frame preservation differs from the requested references')
        if hashlib.sha256(path.read_bytes()).hexdigest() == previous.get('processed_sha256'):
            return previous
        if original.is_file() and hashlib.sha256(original.read_bytes()).hexdigest() != previous.get('original_sha256'):
            raise ValueError('Saved original video differs from the preserved-frame receipt')
    if not original.is_file():
        path.replace(original)
    temporary = path.with_name(path.stem + '-preserving.mp4')
    decoder = subprocess.Popen([ffmpeg, '-nostdin', '-v', 'error', '-i', str(original), '-vf', f'fps={fps},scale={width}:{height}', '-frames:v', str(count), '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    encoder = subprocess.Popen([ffmpeg, '-nostdin', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-threads', '2', str(temporary)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    radius = 4
    try:
        for index in range(count):
            raw = decoder.stdout.read(width * height * 3)
            if len(raw) != width * height * 3:
                raise ValueError('Generated video ended before all requested frames')
            frame = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
            nearest = min(anchors, key=lambda key: abs(key - index))
            distance = abs(nearest - index)
            if distance < radius:
                t = 1 - distance / radius
                weight = t * t * (3 - 2 * t)
                frame = np.rint(frame * (1 - weight) + anchors[nearest] * weight).clip(0, 255).astype(np.uint8)
            encoder.stdin.write(frame.tobytes())
        encoder.stdin.close()
        if decoder.wait(timeout=30) or encoder.wait(timeout=120):
            raise RuntimeError('Timed frame video encoding failed')
        temporary.replace(path)
        result = {'signature': signature, 'reference_frames_preserved': sorted(anchors), 'blend_radius_frames': radius, 'original_output_path': str(original), 'original_sha256': hashlib.sha256(original.read_bytes()).hexdigest(), 'processed_sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        save_receipt(proof, result)
        return result
    finally:
        for process in [decoder, encoder]:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=10)
        decoder.stdout.close()
        decoder.stderr.close()
        encoder.stderr.close()
        if not encoder.stdin.closed:
            try: encoder.stdin.close()
            except OSError: pass
        temporary.unlink(missing_ok=True)
