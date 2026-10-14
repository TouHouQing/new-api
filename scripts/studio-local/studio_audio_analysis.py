"""Analyze actual local audio with pinned CLAP, Whisper and measured beats.

Labels are candidate similarities, not calibrated truth probabilities. Speech
recognition and beat estimates remain proposals for review before editing.
"""
import hashlib
import json
import math
from pathlib import Path

LABELS = [
    'Human speech', 'Singing and vocals', 'Instrumental music', 'Piano music',
    'Guitar music', 'Orchestral music', 'Electronic music', 'Drum beats',
    'Rain and wind', 'Birds singing', 'Footsteps', 'Traffic and engines',
    'Water flowing', 'Silence',
]


def analyze(worker, audio):
    import librosa
    import numpy as np
    import torch
    import soundfile as sf
    from transformers import ClapModel, ClapProcessor
    info = sf.info(audio)
    duration = info.duration
    if info.format not in ['WAV', 'WAVEX'] or info.channels > 2 or not 8000 <= info.samplerate <= 96000 or not math.isfinite(duration) or not .05 <= duration <= 60.1:
        raise ValueError('Audio analysis supports decoded clips between 0.05 and 60 seconds')
    samples, sample_rate = sf.read(audio, dtype='float32', always_2d=True)
    mono = samples.mean(axis=1)
    rms = float(np.sqrt(np.mean(mono**2)))
    result = {'duration': round(duration, 3), 'rms_db': round(20 * math.log10(max(rms, 1e-10)), 2), 'labels': [], 'speech': [], 'tempo_bpm': None, 'limitations': 'Candidate label scores are relative similarity within this label set. Review speech and musical estimates before changing a project.'}
    if rms < 1e-5:
        result.update({'silent': True, 'method': 'measured waveform'})
        return result
    directory = worker.root.parent / 'audio-models' / 'studio-clap'
    if not (directory / 'installed.json').is_file():
        raise ValueError('Install the pinned local audio analysis model before selecting audio analysis')
    # Cache derived evidence by exact source bytes and installed model version.
    digest = hashlib.sha256(Path(audio).read_bytes() + (directory / 'installed.json').read_bytes()).hexdigest()
    cache = worker.root / 'audio-analysis-cache'
    cache.mkdir(exist_ok=True)
    receipt = cache / (digest + '.json')
    if receipt.is_file():
        return json.loads(receipt.read_text(encoding='utf-8'))
    torch.set_num_threads(4)
    if getattr(worker, 'clap', None) is None:
        worker.clap = ClapModel.from_pretrained(directory, local_files_only=True, use_safetensors=False, weights_only=True).eval()
        worker.clap_processor = ClapProcessor.from_pretrained(directory, local_files_only=True)
    waveform = librosa.resample(mono, orig_sr=sample_rate, target_sr=48000)
    windows = [waveform[index:index + 480000] for index in range(0, len(waveform), 480000)]
    torch.manual_seed(0)
    np.random.seed(0)
    inputs = worker.clap_processor(text=LABELS, audio=windows, return_tensors='pt', padding=True, sampling_rate=48000)
    with torch.inference_mode():
        probabilities = worker.clap(**inputs).logits_per_audio.softmax(dim=-1).cpu().numpy().mean(axis=0)
    result['labels'] = sorted([{'label': label, 'score': round(float(score), 5)} for label, score in zip(LABELS, probabilities)], key=lambda item: item['score'], reverse=True)
    if float(probabilities[0] + probabilities[1]) >= .35:
        if worker.asr is None:
            from faster_whisper import WhisperModel
            worker.asr = WhisperModel('tiny', device='cpu', compute_type='int8', cpu_threads=4)
        segments, info = worker.asr.transcribe(str(audio), beam_size=3, vad_filter=True)
        result['speech'] = [{'start': round(max(0, item.start), 3), 'end': round(min(item.end, duration), 3), 'text': item.text.strip()} for item in segments if item.no_speech_prob < .5 and item.avg_logprob > -1 and item.end > item.start]
        result['speech_language'] = info.language
    if float(probabilities[2:8].sum()) >= .4 and duration >= 3:
        tempo, beats = librosa.beat.beat_track(y=waveform, sr=48000)
        if len(beats) >= 4:
            result['tempo_bpm'] = round(float(np.asarray(tempo).reshape(-1)[0]), 1)
            result['beat_times'] = [round(float(value), 3) for value in librosa.frames_to_time(beats, sr=48000)[:200]]
    result['method'] = 'CLAP htsat-unfused + Whisper tiny + measured beat envelope'
    receipt.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result
