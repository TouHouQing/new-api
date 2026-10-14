"""MuseTalk inference with a single visible face and a conservative mouth mask.

The official MuseTalk model code and weights are loaded from a separate checkout;
OpenCV provides face localization without modifying that checkout or ComfyUI.
"""
import math
import subprocess
import sys
from pathlib import Path


def synchronize(checkout, video, audio, output, ffmpeg, seconds=None):
    import cv2
    import numpy as np
    import torch
    import soundfile as sf
    from transformers import WhisperModel
    sys.path.insert(0, str(checkout))
    from musetalk.models.vae import VAE
    from musetalk.models.unet import UNet, PositionalEncoding
    from musetalk.utils.audio_processor import AudioProcessor
    torch.set_num_threads(6)
    models = Path(checkout) / 'models'
    device = torch.device('cpu')
    vae = VAE(str(models / 'sd-vae'))
    unet = UNet(str(models / 'musetalkV15/musetalk.json'), str(models / 'musetalkV15/unet.pth'), device=device)
    unet.model.eval()
    pe = PositionalEncoding(384)
    whisper = WhisperModel.from_pretrained(models / 'whisper').to(device).eval()
    processor = AudioProcessor(str(models / 'whisper'))
    wav = output.with_suffix('.wav')
    trim = [] if seconds is None else ['-t', str(seconds)]
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(audio), *trim, '-ar', '16000', '-ac', '1', str(wav)], check=True, timeout=60)
    duration = sf.info(wav).duration
    if not .1 <= duration <= 30:
        raise ValueError('Local lip sync supports 0.1 to 30 seconds of speech')
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS)
    if not math.isfinite(fps) or fps < 1 or fps > 60:
        raise ValueError('Input video has an invalid frame rate')
    frames = []
    while len(frames) < 1800:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    if not frames:
        raise ValueError('Video cannot be decoded')
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = detector.detectMultiScale(cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY), scaleFactor=1.1, minNeighbors=4, minSize=(48, 48))
    if len(faces) != 1:
        raise ValueError('Lip sync needs exactly one clearly visible frontal face')
    x, y, width, height = [int(value) for value in faces[0]]
    frame_height, frame_width = frames[0].shape[:2]
    x1, y1 = max(0, x - width // 10), max(0, y - height // 10)
    x2, y2 = min(frame_width, x + width + width // 10), min(frame_height, y + height + height // 5)
    features, length = processor.get_audio_feature(str(wav), weight_dtype=torch.float32)
    with torch.inference_mode():
        chunks = processor.get_whisper_chunk(features, device, torch.float32, whisper, length, fps=int(round(fps)))
    silent = output.with_name('silent.mp4')
    writer = cv2.VideoWriter(str(silent), cv2.VideoWriter_fourcc(*'mp4v'), fps, (frame_width, frame_height))
    if not writer.isOpened():
        raise ValueError('Video encoder is unavailable')
    alpha = np.zeros((y2 - y1, x2 - x1), dtype=np.float32)
    # Blend the mouth and nearby lips, keeping the nose, cheeks and chin from
    # the original face. Coordinates come from the detected face before padding.
    mouth_center = (x + width // 2 - x1, int(y + height * .76) - y1)
    mouth_axes = (max(1, int(width * .24)), max(1, int(height * .12)))
    cv2.ellipse(alpha, mouth_center, mouth_axes, 0, 0, 360, 1, -1)
    alpha = cv2.GaussianBlur(alpha, (21, 21), 0)[..., None]
    try:
        with torch.inference_mode():
            for index, chunk in enumerate(chunks[:math.ceil(duration * fps)]):
                frame = frames[min(index, len(frames)-1)].copy()
                face = cv2.resize(frame[y1:y2, x1:x2], (256, 256), interpolation=cv2.INTER_LANCZOS4)
                latent = vae.get_latents_for_unet(face)
                prediction = unet.model(latent, torch.tensor([0]), encoder_hidden_states=pe(chunk.unsqueeze(0))).sample
                generated = vae.decode_latents(prediction)[0]
                generated = cv2.resize(generated, (x2-x1, y2-y1))
                frame[y1:y2, x1:x2] = np.clip(frame[y1:y2, x1:x2] * (1-alpha) + generated * alpha, 0, 255).astype(np.uint8)
                writer.write(frame)
                if index % 12 == 0:
                    print('MuseTalk frames:', index + 1, '/', len(chunks), flush=True)
    finally:
        writer.release()
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(silent), '-i', str(wav), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-c:a', 'aac', '-t', str(duration), '-shortest', '-movflags', '+faststart', str(output)], check=True, timeout=120)
