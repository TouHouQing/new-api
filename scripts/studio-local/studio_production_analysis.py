"""Bounded, CPU-only production evidence. Never downloads a model or edits media."""
import base64
import hashlib
import json
import math
import os
import subprocess
import tempfile
import time
from pathlib import Path


def _number(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} is outside the supported range')
    return float(value)


def _prune_cache(cache):
    entries = []
    now = time.time()
    for item in cache.iterdir():
        if item.is_symlink() or not item.is_file() or len(item.stem) != 64 or any(char not in '0123456789abcdef' for char in item.stem):
            continue
        info = item.stat()
        if item.suffix == '.tmp' and now-info.st_mtime > 86400:
            item.unlink(missing_ok=True)
        elif item.suffix == '.json':
            entries.append((info.st_mtime, info.st_size, item))
    size = sum(item[1] for item in entries)
    for modified, length, item in sorted(entries):
        if now-modified > 7*86400 or size > 64*1024*1024:
            item.unlink(missing_ok=True)
            size -= length


def audio_structure(path):
    import librosa
    import numpy as np
    import soundfile as sf
    info = sf.info(path)
    if info.channels != 1 or info.samplerate != 22050 or not .05 <= info.duration <= 61:
        raise ValueError('Provide a mono 22050 Hz WAV interval of at most 61 seconds')
    samples, sr = sf.read(path, dtype='float32')
    if not np.isfinite(samples).all():
        raise ValueError('Audio contains non-finite samples')
    hop = 256
    rms = librosa.feature.rms(y=samples, frame_length=1024, hop_length=hop)[0]
    envelope = librosa.onset.onset_strength(y=samples, sr=sr, hop_length=hop)
    silent = float(np.max(np.abs(samples))) < 1e-5
    tempo, beats = (np.array([0.0]), np.array([], dtype=int)) if silent else librosa.beat.beat_track(onset_envelope=envelope, sr=sr, hop_length=hop, trim=False)
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    beat_times = [round(float(value), 6) for value in beat_times if 0 <= value < info.duration]
    onsets = librosa.onset.onset_detect(onset_envelope=envelope, sr=sr, hop_length=hop, units='time') if not silent else np.array([])
    beat_support = sum(1 for value in beat_times if len(onsets) and float(np.min(np.abs(onsets-value))) <= .08) / max(1, len(beat_times))
    if len(onsets) < 3 or beat_support < .4:
        beat_times = []
    # Novelty of measured chroma and energy provides editable boundaries, not
    # fabricated verse/chorus names or a claim to understand musical form.
    boundaries = [0.0]
    if not silent and info.duration >= 4:
        chroma = librosa.feature.chroma_stft(y=samples, sr=sr, hop_length=hop, n_fft=1024)
        feature = np.vstack([chroma, rms[None, :] / max(float(rms.max()), 1e-8)])
        lag = max(1, round(sr / hop))
        novelty = np.mean(np.abs(feature[:, lag:] - feature[:, :-lag]), axis=0)
        candidates = np.flatnonzero(novelty > max(.12, float(np.percentile(novelty, 92)))) + lag
        for frame in candidates:
            seconds = float(librosa.frames_to_time(frame, sr=sr, hop_length=hop))
            if seconds - boundaries[-1] >= 3 and info.duration - seconds >= 2:
                boundaries.append(round(seconds, 6))
    boundaries.append(round(info.duration, 6))
    sections = []
    for start, end in zip(boundaries, boundaries[1:]):
        first, last = int(start * sr / hop), max(int(end * sr / hop), int(start * sr / hop) + 1)
        level = float(np.mean(rms[first:last])) if len(rms[first:last]) else 0
        sections.append({'start': start, 'end': end, 'label': 'silence' if level < 1e-5 else 'section_candidate', 'rms_db': round(20 * math.log10(max(level, 1e-10)), 2), 'review_required': True})
    return {'kind': 'audio_structure', 'method': 'librosa onset/beat tracking + chroma/energy novelty', 'duration': round(info.duration, 6), 'silent': silent, 'tempo_bpm': round(float(np.asarray(tempo).reshape(-1)[0]), 3) if len(beat_times) >= 3 else None, 'beat_times': beat_times, 'beat_onset_support': round(beat_support, 4), 'sections': sections, 'review_required': True, 'limitations': ['Beat grid may have half/double-tempo ambiguity; onset support is a diagnostic, not a probability.', 'Sections are acoustic change candidates; verse, chorus and bridge require human naming.', 'No speech recognition or model download is performed.']}


def subject_track(path, ffmpeg, options):
    import cv2
    import numpy as np
    ffprobe = str(Path(ffmpeg).with_name('ffprobe' + Path(ffmpeg).suffix))
    probe = json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', str(path)], timeout=30))
    duration = float(probe['format']['duration'])
    if not math.isfinite(duration) or not .05 <= duration <= 120.1:
        raise ValueError('Subject tracking supports intervals of at most 120 seconds')
    if not probe.get('streams') or max(probe['streams'][0]['width'], probe['streams'][0]['height']) > 480:
        raise ValueError('Tracking input must be normalized to a maximum side of 480 pixels')
    frame_probe = json.loads(subprocess.check_output([ffprobe, '-v', 'error', '-select_streams', 'v:0', '-read_intervals', '%+#30001', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', str(path)], timeout=60))
    timestamps = [float(item['best_effort_timestamp_time']) for item in frame_probe.get('frames', []) if 'best_effort_timestamp_time' in item]
    if not timestamps or len(timestamps) > 30000 or any(not math.isfinite(value) or value < 0 for value in timestamps) or any(second < first for first, second in zip(timestamps, timestamps[1:])):
        raise ValueError('Video does not have usable bounded presentation timestamps')
    anchor = _number(options.get('anchor_time', 0), 'anchor_time', 0, max(0, duration - .001))
    requested = options.get('roi')
    if not isinstance(requested, dict):
        raise ValueError('Select an initial subject rectangle')
    roi = [_number(requested.get(key), 'roi.' + key, 0, 1) for key in ['x', 'y', 'width', 'height']]
    if roi[2] <= 0 or roi[3] <= 0 or roi[0] + roi[2] > 1.000001 or roi[1] + roi[3] > 1.000001:
        raise ValueError('Subject rectangle lies outside the image')
    aspect = _number(options.get('target_aspect', 9 / 16), 'target_aspect', .25, 4)
    capture = cv2.VideoCapture(str(path))
    frames, times = [], []
    selected_anchor = min(range(len(timestamps)), key=lambda i: abs(timestamps[i] - anchor))
    last_time = -1.0
    width = height = 0
    try:
        for index, pts in enumerate(timestamps):
            ok, frame = capture.read()
            if not ok:
                raise ValueError('Video decode ended before its presentation timestamps')
            if pts - last_time < .125 and index != selected_anchor:
                continue
            height, width = frame.shape[:2]
            if max(width, height) > 480:
                raise ValueError('Tracking input must be normalized to a maximum side of 480 pixels')
            frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
            times.append(pts)
            last_time = pts
            if sum(value.size for value in frames) > 110_000_000:
                raise ValueError('Tracking interval exceeds the decoded memory limit; select a shorter shot')
    finally:
        capture.release()
    if not frames:
        raise ValueError('Video has no decodable frames')
    anchor_index = min(range(len(times)), key=lambda i: abs(times[i] - anchor))
    initial = np.array([roi[0] * width, roi[1] * height, roi[2] * width, roi[3] * height], dtype=np.float32)
    if min(initial[2:]) < 8:
        raise ValueError('Subject rectangle must cover at least 8 decoded pixels on each side')
    points = [None] * len(frames)

    def output(index, box, confidence, reason):
        normalized = [float(box[0] / width), float(box[1] / height), float(box[2] / width), float(box[3] / height)]
        crop_w, crop_h = (height * aspect, height) if width / height >= aspect else (width, width / aspect)
        center_x, center_y = box[0] + box[2] / 2, box[1] + box[3] / 2
        left = min(max(center_x - crop_w / 2, 0), width - crop_w)
        top = min(max(center_y - crop_h / 2, 0), height - crop_h)
        fits = box[2] <= crop_w and box[3] <= crop_h
        return {'time': round(times[index], 6), 'roi': dict(zip(['x', 'y', 'width', 'height'], [round(value, 6) for value in normalized])), 'confidence': round(confidence, 4), 'review_required': bool(reason or confidence < .65 or not fits), 'reason': reason or ('' if fits else 'subject_does_not_fit_target'), 'crop': {'x': round(float(left / width), 6), 'y': round(float(top / height), 6), 'width': round(float(crop_w / width), 6), 'height': round(float(crop_h / height), 6)}}

    points[anchor_index] = output(anchor_index, initial, 1.0, 'user_selected_anchor')
    for step in [-1, 1]:
        box, previous = initial.copy(), frames[anchor_index]
        failed = ''
        for index in range(anchor_index + step, len(frames) if step > 0 else -1, step):
            current = frames[index]
            confidence = 0.0
            if not failed:
                # Optical-flow translation with forward/backward consistency.
                mask = np.zeros_like(previous)
                x, y, w, h = np.round(box).astype(int)
                mask[max(0, y):min(height, y+h), max(0, x):min(width, x+w)] = 255
                corners = cv2.goodFeaturesToTrack(previous, maxCorners=120, qualityLevel=.015, minDistance=3, mask=mask)
                global_change = float(np.mean(cv2.absdiff(previous, current))) / 255
                if global_change > .34:
                    failed = 'scene_cut_or_large_change'
                elif corners is None or len(corners) < 5:
                    failed = 'insufficient_subject_features'
                else:
                    following, valid, _ = cv2.calcOpticalFlowPyrLK(previous, current, corners, None, winSize=(31,31), maxLevel=3)
                    back, back_valid, _ = cv2.calcOpticalFlowPyrLK(current, previous, following, None, winSize=(31,31), maxLevel=3)
                    error = np.linalg.norm(corners.reshape(-1, 2) - back.reshape(-1, 2), axis=1)
                    keep = (valid.reshape(-1) == 1) & (back_valid.reshape(-1) == 1) & (error < 1.5)
                    if int(keep.sum()) < 5:
                        failed = 'occluded_or_lost'
                    else:
                        motion = following.reshape(-1,2)[keep] - corners.reshape(-1,2)[keep]
                        delta = np.median(motion, axis=0)
                        consistency = np.linalg.norm(motion - delta, axis=1) < 3
                        confidence = float(keep.mean() * consistency.mean())
                        candidate = box.copy()
                        candidate[:2] += delta
                        nx, ny, nw, nh = np.round(candidate).astype(int)
                        if nx < 0 or ny < 0 or nx + nw > width or ny + nh > height:
                            failed = 'subject_out_of_frame'
                        else:
                            original = previous[y:y+h, x:x+w]
                            following_patch = current[ny:ny+nh, nx:nx+nw]
                            similarity = float(cv2.matchTemplate(following_patch, original, cv2.TM_CCOEFF_NORMED)[0,0]) if original.shape == following_patch.shape and original.size else 0
                            if not math.isfinite(similarity) or similarity < .35 or confidence < .45:
                                failed = 'appearance_changed_or_occluded'
                            else:
                                box = candidate
                                confidence *= max(0, min(1, similarity))
                if failed:
                    confidence = 0.0
            points[index] = output(index, box, confidence, failed)
            previous = current
    return {'kind': 'subject_track', 'method': 'CPU OpenCV Lucas-Kanade forward/backward optical flow + appearance/cut checks', 'duration': round(duration, 6), 'width': width, 'height': height, 'anchor_time': round(times[anchor_index], 6), 'target_aspect': aspect, 'points': points, 'review_required': any(point['review_required'] for point in points), 'limitations': ['Manual ROI identity is required; this is not automatic person recognition.', 'Occlusion, scene changes and loss stop trusted tracking until a user selects another anchor.', 'Trajectory uses sampled actual presentation timestamps at up to 8 Hz; preview and render must use the same sampling.', 'Boxes follow translation only; scale and deformation require manual correction.']}


def analyze_payload(worker, body):
    action = body.get('action')
    if action not in ['audio_structure', 'subject_track']:
        raise ValueError('Unsupported CPU production analysis')
    encoded = body.get('media')
    if not isinstance(encoded, str) or not 1 <= len(encoded) <= 32 * 1024 * 1024:
        raise ValueError('Analysis media must be bounded base64, never a URL')
    raw = base64.b64decode(encoded, validate=True)
    if not 1 <= len(raw) <= 24 * 1024 * 1024:
        raise ValueError('Analysis media exceeds 24 MiB')
    options = body.get('options') or {}
    signature = hashlib.sha256(raw + json.dumps({'version': 1, 'action': action, 'options': options}, sort_keys=True, allow_nan=False).encode()).hexdigest()
    cache = worker.root / 'production-analysis-cache'
    if cache.is_symlink():
        raise ValueError('Analysis cache must stay inside the worker directory')
    cache.mkdir(exist_ok=True)
    _prune_cache(cache)
    receipt = cache / (signature + '.json')
    if receipt.is_file():
        return json.loads(receipt.read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='production-analysis-', dir=worker.root) as directory:
        source = Path(directory) / ('source.wav' if action == 'audio_structure' else 'source.mp4')
        source.write_bytes(raw)
        result = audio_structure(source) if action == 'audio_structure' else subject_track(source, worker.ffmpeg, options)
        result['input_digest'] = hashlib.sha256(raw).hexdigest()
        content = json.dumps(result, ensure_ascii=False, allow_nan=False)
        if len(content) > 2 * 1024 * 1024:
            raise ValueError('Analysis result exceeds 2 MiB')
        # Atomic replacement prevents a worker restart from leaving a partial
        # receipt that would be mistaken for a completed analysis.
        temporary = receipt.with_suffix('.tmp')
        try:
            temporary.write_text(content, encoding='utf-8')
            os.replace(temporary, receipt)
        finally:
            temporary.unlink(missing_ok=True)
        return result
