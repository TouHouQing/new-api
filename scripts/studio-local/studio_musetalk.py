"""MuseTalk inference with a single visible face and a conservative mouth mask.

The official MuseTalk model code and weights are loaded from a separate checkout;
OpenCV provides face localization without modifying that checkout or ComfyUI.
"""
import json
import math
import subprocess
import sys
from pathlib import Path


def single_visible_face(boxes, weights):
    """Collapse duplicate cascade windows, never choose among separate speakers.

    A second strong overlapping detection remains ambiguous. Only nearly
    identical windows, or a much weaker overlapping window around the same
    face, are suppressed. The highest-confidence window supplies the mouth
    coordinates; choosing the largest window can put the mask on the neck.
    """
    if len(boxes) != len(weights):
        raise ValueError('Face detection returned inconsistent confidence data')
    candidates = []
    for box, weight in zip(boxes, weights):
        if len(box) != 4:
            raise ValueError('Face detection returned an invalid face box')
        values = tuple(float(value) for value in box)
        score = float(weight)
        if not all(math.isfinite(value) for value in (*values, score)) or values[0] < 0 or values[1] < 0 or values[2] < 48 or values[3] < 48:
            raise ValueError('Face detection returned an invalid face box or confidence')
        candidates.append((values, score))
    retained = []
    for box, score in sorted(candidates, key=lambda item: item[1], reverse=True):
        x, y, width, height = box
        duplicate = False
        for other, higher in retained:
            ox, oy, ow, oh = other
            intersection = max(0, min(x+width, ox+ow)-max(x, ox)) * max(0, min(y+height, oy+oh)-max(y, oy))
            smaller = min(width*height, ow*oh)
            overlap = intersection / (width*height + ow*oh - intersection)
            center = math.hypot(x+width/2-ox-ow/2, y+height/2-oy-oh/2) / min(width, height, ow, oh)
            area_ratio = max(width*height, ow*oh) / smaller
            almost_identical = overlap >= .9 and center <= .08 and area_ratio <= 1.2
            weaker_duplicate = overlap >= .4 and intersection/smaller >= .65 and center <= .45 and area_ratio <= 1.6 and higher-score >= 3
            if almost_identical or weaker_duplicate:
                duplicate = True
                break
        if not duplicate:
            retained.append((box, score))
    if len(retained) != 1:
        raise ValueError('Lip sync needs exactly one clearly visible frontal face; choose a speaker region for separate or ambiguous overlapping faces')
    if retained[0][1] < 3:
        raise ValueError('Frontal face confidence is low; use a clearer face or select its region for manual review')
    return tuple(int(round(value)) for value in retained[0][0])


def validate_lip_request(body):
    references = body.get('references')
    if not isinstance(references, list) or len(references) != 2 or sorted(item.get('type', '') for item in references if isinstance(item, dict)) != ['audio', 'video']:
        raise ValueError('Lip sync needs exactly one audio and one video reference')
    return validate_lip_selection(body.get('edit'), (body.get('options') or {}).get('lip_audio_start', 0), body.get('seconds'))


def validate_lip_selection(edit, audio_start, seconds, video_meta=None, audio_duration=None):
    if not isinstance(edit, dict):
        raise ValueError('Select an explicit source video interval')
    values = [edit.get('start'), edit.get('end'), audio_start, seconds]
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
        raise ValueError('Lip sync source times must be finite numbers')
    start, end = values[:2]
    duration = end - start
    if start < 0 or end > 3600 or audio_start < 0 or audio_start > 3600 or not .1 <= duration <= 30 or abs(seconds-duration) > .001 or edit.get('speed', 0) != 0 or edit.get('rotation', 0) != 0:
        raise ValueError('Select a 0.1 to 30 second interval with matching duration')
    roi = tuple(edit.get(key, 0) for key in ('x', 'y', 'width', 'height'))
    if any(isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 8192 for value in roi):
        raise ValueError('Speaker region uses bounded source-pixel coordinates')
    automatic = roi == (0, 0, 0, 0)
    if not automatic and (roi[2] < 48 or roi[3] < 48):
        raise ValueError('Speaker region must be at least 48 pixels in each dimension')
    if video_meta is not None:
        if end > video_meta['duration'] + .001 or not automatic and (roi[0]+roi[2] > video_meta['width'] or roi[1]+roi[3] > video_meta['height']):
            raise ValueError('Selected video interval or speaker region exceeds the source')
    if audio_duration is not None and audio_start+duration > audio_duration+.001:
        raise ValueError('Selected dialogue audio does not cover the entire video interval')
    return {'start': start, 'end': end, 'audio_start': audio_start, 'duration': duration, 'roi': None if automatic else roi}


def selected_face(frame, detector, region=None):
    import cv2
    frame_height, frame_width = frame.shape[:2]
    rx, ry, rw, rh = region or (0, 0, frame_width, frame_height)
    gray = cv2.cvtColor(frame[ry:ry+rh, rx:rx+rw], cv2.COLOR_BGR2GRAY)
    faces, _, confidence = detector.detectMultiScale3(gray, scaleFactor=1.1, minNeighbors=4, minSize=(48, 48), outputRejectLevels=True)
    x, y, width, height = single_visible_face(faces, confidence)
    return x+rx, y+ry, width, height


def validate_face_track(boxes):
    for before, after in zip(boxes, boxes[1:]):
        x, y, width, height = before
        ax, ay, aw, ah = after
        movement = math.hypot(ax+aw/2-x-width/2, ay+ah/2-y-height/2)
        if movement > min(width, height)*.5 or max(aw/width, width/aw, ah/height, height/ah) > 1.5:
            raise ValueError('Selected face was lost or changed abruptly; choose a shorter interval or tighter speaker region')


def lip_crop_geometry(box, region, frame_width, frame_height):
    """An explicitly reviewed face crop must not become a nose-only crop.

    Cascades can classify a small nose/mouth window inside a glasses portrait.
    Keep their conservative single-speaker/track checks, but honor the manual
    full-face rectangle as the model input and place its mask in the lower face.
    """
    x,y,width,height = box
    if region:
        rx,ry,rw,rh = region
        if not (rx <= x < x+width <= rx+rw and ry <= y < y+height <= ry+rh):
            raise ValueError('Detected speaker exceeds the reviewed face region')
        return {'crop': (rx,ry,rx+rw,ry+rh), 'center': (rw//2,round(rh*.70)), 'axes': (max(1,round(rw*.27)),max(1,round(rh*.13))), 'source': 'reviewed-full-face-region'}
    x1,y1 = max(0,x-width//10),max(0,y-height//10)
    x2,y2 = min(frame_width,x+width+width//10),min(frame_height,y+height+height//5)
    return {'crop': (x1,y1,x2,y2), 'center': (x+width//2-x1,int(y+height*.76)-y1), 'axes': (max(1,int(width*.24)),max(1,int(height*.12))), 'source': 'single-frontal-face-cascade'}


def prepare_lip_feature_audio(wav, feature_wav, fps):
    """Complete the last speech-feature window without changing the dialogue.

    The upstream processor floors audio duration to whole video frames. A last
    partial frame still needs conditioning. Pad only its separate feature input
    with silence; final muxing continues to use the untouched selected dialogue.
    """
    import numpy as np
    import soundfile as sf
    if isinstance(fps, bool) or not isinstance(fps, int) or not 1 <= fps <= 60:
        raise ValueError('Input video has an invalid frame rate')
    samples, rate = sf.read(wav, dtype='float32', always_2d=True)
    if rate != 16000 or samples.shape[1] != 1 or len(samples) < 1:
        raise ValueError('Speech feature input must be nonempty mono 16 kHz audio')
    frame_count = math.ceil(len(samples) * fps / rate - .001)
    required = max(len(samples), math.ceil(frame_count * rate / fps))
    # Protect the upstream float-floor boundary with a real extra zero sample.
    if math.floor(required / rate * fps) < frame_count:
        required += 1
    padding = required - len(samples)
    if frame_count < 1 or padding < 0 or padding > math.ceil(rate / fps):
        raise ValueError('Speech feature padding exceeds one video frame')
    sf.write(feature_wav, np.pad(samples, ((0, padding), (0, 0))), rate, subtype='FLOAT')
    return {'policy': 'complete-last-feature-window-v1', 'fps': fps, 'frame_count': frame_count, 'dialogue_samples': len(samples), 'feature_samples': required, 'feature_padding_samples': padding, 'sample_rate': rate}


def mux_lip_output(silent, wav, output, ffmpeg, timing):
    """Keep the inferred partial last frame and the entire selected dialogue.

    Cutting at a fractional frame with -t/-shortest discards a real inferred
    frame. The complete last frame may extend less than one frame beyond the
    audio; neither source is looped, frozen or shortened to hide that boundary.
    """
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(silent), '-i', str(wav), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', str(output)], check=True, timeout=120)
    probe = str(Path(ffmpeg).with_name('ffprobe' + Path(ffmpeg).suffix))
    metadata = json.loads(subprocess.check_output([probe, '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(output)], timeout=60))
    video = next(item for item in metadata['streams'] if item['codec_type'] == 'video')
    audio = next(item for item in metadata['streams'] if item['codec_type'] == 'audio')
    expected_audio = timing['dialogue_samples'] / timing['sample_rate']
    frames = int(video['nb_read_frames'])
    if frames != timing['frame_count'] or abs(float(audio['duration']) - expected_audio) > .002:
        raise ValueError('Lip output lost an inferred frame or selected dialogue')
    difference = float(video['duration']) - expected_audio
    if difference < -.002 or difference > 1 / timing['fps'] + .002:
        raise ValueError('Lip output exceeds the last partial frame boundary')
    return {'mux_policy': 'preserve-inferred-last-frame-v1', 'output_frames': frames, 'video_seconds': float(video['duration']), 'audio_seconds': float(audio['duration']), 'container_seconds': float(metadata['format']['duration'])}


def synchronize(checkout, video, audio, output, ffmpeg, seconds=None, edit=None, audio_start=0):
    import cv2
    import numpy as np
    import torch
    import soundfile as sf
    from transformers import WhisperModel
    selection = validate_lip_selection(edit, audio_start, seconds)
    probe = str(Path(ffmpeg).with_name('ffprobe' + Path(ffmpeg).suffix))
    metadata = json.loads(subprocess.check_output([probe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(video)], timeout=30))
    stream = next((item for item in metadata['streams'] if item['codec_type'] == 'video'), None)
    if not stream:
        raise ValueError('The selected source contains no video')
    audio_meta = json.loads(subprocess.check_output([probe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(audio)], timeout=30))
    if not any(item['codec_type'] == 'audio' for item in audio_meta['streams']):
        raise ValueError('The selected dialogue contains no audio')
    selection = validate_lip_selection(edit, audio_start, seconds, {'duration': float(metadata['format']['duration']), 'width': int(stream['width']), 'height': int(stream['height'])}, float(audio_meta['format']['duration']))
    numerator, denominator = map(int, stream['avg_frame_rate'].split('/'))
    rate = numerator/denominator if denominator else 0
    if not math.isfinite(rate) or not 1 <= rate <= 60:
        raise ValueError('Input video has an invalid frame rate')
    fps = round(rate)
    # Decode only the selected source interval. No repeat-last-frame fallback.
    selected_video = output.with_name('selected-source.mp4')
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-ss', str(selection['start']), '-i', str(video), '-t', str(selection['duration']), '-an', '-vf', 'fps='+str(fps), '-c:v', 'libx264', '-crf', '18', str(selected_video)], check=True, timeout=120)
    wav = output.with_suffix('.wav')
    subprocess.run([ffmpeg, '-nostdin', '-y', '-v', 'error', '-ss', str(audio_start), '-i', str(audio), '-t', str(seconds), '-ar', '16000', '-ac', '1', str(wav)], check=True, timeout=60)
    duration = sf.info(wav).duration
    if abs(duration-seconds) > .002:
        raise ValueError('Decoded audio does not cover the selected interval')
    feature_wav = output.with_name('speech-feature-input.wav')
    timing = prepare_lip_feature_audio(wav, feature_wav, fps)
    frame_count = timing['frame_count']
    output.with_name('lip-timing.json').write_text(json.dumps(timing), encoding='utf-8')
    capture = cv2.VideoCapture(str(selected_video))
    frames = []
    while len(frames) < 1800:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    if len(frames) < frame_count:
        raise ValueError('Source video has too few frames; extend the source instead of freezing it')
    detector = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    # Preflight every frame before loading models. A lost/ambiguous speaker
    # requires a new manual region or interval, never a switch to another face.
    frames = frames[:frame_count]
    boxes = [selected_face(frame, detector, selection['roi']) for frame in frames]
    validate_face_track(boxes)
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
    frame_height, frame_width = frames[0].shape[:2]
    features, length = processor.get_audio_feature(str(feature_wav), weight_dtype=torch.float32)
    with torch.inference_mode():
        chunks = processor.get_whisper_chunk(features, device, torch.float32, whisper, length, fps=int(round(fps)))
    silent = output.with_name('silent.mp4')
    writer = cv2.VideoWriter(str(silent), cv2.VideoWriter_fourcc(*'mp4v'), fps, (frame_width, frame_height))
    if not writer.isOpened():
        raise ValueError('Video encoder is unavailable')
    if len(chunks) < frame_count:
        writer.release()
        raise ValueError('Speech features do not cover the selected interval')
    try:
        with torch.inference_mode():
            for index, chunk in enumerate(chunks[:frame_count]):
                if index >= len(frames):
                    raise ValueError('Source frame missing; no freeze fallback is allowed')
                frame = frames[index].copy()
                x, y, width, height = boxes[index]
                geometry = lip_crop_geometry(boxes[index],selection['roi'],frame_width,frame_height)
                x1,y1,x2,y2 = geometry['crop']
                alpha = np.zeros((y2-y1, x2-x1), dtype=np.float32)
                cv2.ellipse(alpha, geometry['center'], geometry['axes'], 0, 0, 360, 1, -1)
                alpha = cv2.GaussianBlur(alpha, (21,21), 0)[...,None]
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
    timing.update(mux_lip_output(silent, wav, output, ffmpeg, timing))
    timing['face_geometry'] = lip_crop_geometry(boxes[0],selection['roi'],frame_width,frame_height)
    output.with_name('lip-timing.json').write_text(json.dumps(timing), encoding='utf-8')
