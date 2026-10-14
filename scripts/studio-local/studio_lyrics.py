"""Report recognized lyric coverage without supplying the lyrics to ASR."""
import re
import unicodedata
from studio_comfy_receipts import save_receipt


def tokens(value):
    return re.findall(r'[\u3400-\u9fff]|[^\W_]+', unicodedata.normalize('NFKC', value).casefold())


def compare_lyrics(lyrics, transcript, segments=None):
    lines = [line.strip() for line in lyrics.splitlines() if line.strip() and not re.fullmatch(r'\s*\[[^\]]+\]\s*', line)]
    actual = tokens(transcript)
    cursor, result = 0, []
    for line in lines:
        expected = tokens(line)
        index = next((start for start in range(cursor, len(actual) - len(expected) + 1) if expected and actual[start:start + len(expected)] == expected), None)
        entry = {'text': line, 'matched': index is not None}
        if index is not None and segments:
            offset, selected = 0, []
            for segment in segments:
                count = len(tokens(segment['text']))
                if offset < index + len(expected) and offset + count > index: selected.append(segment)
                offset += count
            if selected: entry.update({'start': float(selected[0]['start']), 'end': float(selected[-1]['end'])})
        result.append(entry)
        if index is not None:
            cursor = index + len(expected)
    return {'status': 'matched' if result and all(item['matched'] for item in result) else 'review_required', 'transcript': transcript, 'lines': result}


def song_artifacts(worker, body, work, output):
    report_path = work / 'lyrics-check.json'
    if not report_path.is_file():
        try:
            # Expected lyrics must never become an ASR hint.
            target = output
            start = body.get('options', {}).get('repair_start')
            end = body.get('options', {}).get('repair_end')
            if start is not None and end is not None:
                import subprocess
                target = work / 'repair-check.wav'
                subprocess.run([worker.ffmpeg, '-nostdin', '-v', 'error', '-y', '-ss', str(start), '-i', str(output), '-t', str(end - start), str(target)], check=True, capture_output=True, timeout=60)
            try:
                with worker.lock:
                    recognized = worker.transcribe(target, body.get('language'))
            finally:
                if target != output: target.unlink(missing_ok=True)
            if start is not None:
                for segment in recognized.get('segments', []) + recognized.get('words', []): segment['start'] += start; segment['end'] += start
            report = compare_lyrics(body['options']['lyrics'], recognized['text'], recognized.get('words') or recognized.get('segments'))
        except Exception:
            report = {'status': 'unavailable', 'transcript': '', 'lines': []}
        if (work / 'repair-manifest.json').is_file(): report['repair'] = __import__('json').loads((work / 'repair-manifest.json').read_text())
        save_receipt(report_path, report)
    artifacts = [
        {'key': 'output', 'type': 'audio', 'mime_type': 'audio/wav', 'path': str(output)},
        {'key': 'lyrics_check', 'type': 'file', 'mime_type': 'application/json', 'path': str(report_path)},
    ]
    if (work / 'repair-candidate.wav').is_file(): artifacts.append({'key': 'vocal_candidate', 'type': 'audio', 'mime_type': 'audio/wav', 'path': str(work / 'repair-candidate.wav')})
    return artifacts


def repair_song(worker, job_id, body, output):
    """Replace vocals only in one interval and retain the original accompaniment."""
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    from math import gcd
    from types import SimpleNamespace
    from studio_media_tools import audio_tool
    options = body['options']
    start, end = options['repair_start'], options['repair_end']
    source_ref = next(item for item in body['references'] if item['type'] == 'audio')
    work = output.parent
    source = worker.reference(source_ref, work / 'original-song.bin')
    source_info = sf.info(source)
    original, rate = sf.read(source, dtype='float32', always_2d=True)
    if end > len(original) / rate: raise ValueError('Song repair interval exceeds the source audio')
    patch_work = work / 'repair-song'; patch_work.mkdir(exist_ok=True)
    patch_body = {**body, 'references': [], 'options': {k: v for k, v in options.items() if k not in {'repair_start', 'repair_end'}}}
    patch_output = patch_work / 'output.wav'
    manual = body.get('operation') == 'audio_separate'
    if manual:
        audio_refs = [ref for ref in body['references'] if ref['type']=='audio']
        if len(audio_refs)!=2: raise ValueError('Choose original audio first and candidate audio second')
        patch_output = worker.reference(audio_refs[1], patch_output)
        candidate_seconds = sf.info(patch_output).duration
        if options['candidate_end'] > candidate_seconds or body['seconds'] + .001 < source_info.duration + candidate_seconds: raise ValueError('Candidate selection or processing duration exceeds available audio')
        coverage = None
        manifest = {'start':start,'end':end,'source_seconds':source_info.duration,'processing_seconds':source_info.duration+candidate_seconds,'selection_method':'user_selected_intervals','preserved':'Original accompaniment and audio outside the selected interval','review_required':True}
    else:
        worker.music(job_id + '-phrase', patch_body, patch_output)
    # A short phrase may occur after the model's intro. Align recognized words
    # before replacing vocals; an unrecognized candidate must not erase the source.
    if not manual:
        with worker.lock: recognized = worker.transcribe(patch_output, body.get('language'))
        coverage = compare_lyrics(options['lyrics'], recognized['text'], recognized.get('words') or recognized.get('segments'))
        manifest = {'start': start, 'end': end, 'generation_seconds': body['seconds'], 'source_seconds': len(original) / rate, 'preserved': 'Original accompaniment and audio outside the selected interval', 'review_required': True, 'candidate_transcript': recognized['text']}
    if not manual and (coverage['status'] != 'matched' or not all('start' in line for line in coverage['lines'])):
        import shutil
        shutil.copyfile(source, output); shutil.copyfile(patch_output, work / 'repair-candidate.wav')
        save_receipt(work / 'repair-manifest.json', {**manifest, 'applied': False, 'reason': 'The candidate words were not independently recognized. Original audio is retained; listen to the candidate or retry.'})
        return
    stem_results = []
    for name, reference, local in [('original', source_ref, None), ('phrase', {'type': 'audio'}, patch_output)]:
        folder = work / ('stems-' + name); folder.mkdir(exist_ok=True)
        proxy = worker if local is None else SimpleNamespace(ffmpeg=worker.ffmpeg, reference=lambda _reference, _target: local)
        stems = audio_tool(proxy, {'operation': 'audio_separate', 'references': [reference], 'options': {}}, folder)
        vocal, vocal_rate = sf.read(stems['path'], dtype='float32', always_2d=True)
        divisor = gcd(rate, vocal_rate)
        vocal = resample_poly(vocal, rate // divisor, vocal_rate // divisor, axis=0)
        if vocal.shape[1] != original.shape[1]: vocal = np.repeat(vocal.mean(axis=1, keepdims=True), original.shape[1], axis=1)
        stem_results.append(vocal)
    original_vocal, patch_vocal = stem_results
    a, b = round(start * rate), round(end * rate)
    count = b - a
    phrase_start = options['candidate_start'] if manual else max(0, min(line['start'] for line in coverage['lines']) - .08)
    phrase_end = options['candidate_end'] if manual else min(len(patch_vocal) / rate, max(line['end'] for line in coverage['lines']) + .08)
    phrase = patch_vocal[round(phrase_start * rate):round(phrase_end * rate)]
    if len(phrase) > count:
        import subprocess
        phrase_path, fitted_path = work / 'phrase.wav', work / 'phrase-fitted.wav'
        sf.write(phrase_path, phrase, rate, subtype='FLOAT')
        speed = len(phrase) / count; factors = []
        while speed > 2: factors.append('atempo=2'); speed /= 2
        factors.append('atempo=' + str(speed))
        try:
            subprocess.run([worker.ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(phrase_path), '-af', ','.join(factors), str(fitted_path)], check=True, capture_output=True, timeout=60)
            phrase, _ = sf.read(fitted_path, dtype='float32', always_2d=True)
        finally: phrase_path.unlink(missing_ok=True); fitted_path.unlink(missing_ok=True)
    patch = np.pad(phrase[:count], ((0, max(0, count - len(phrase))), (0, 0)))
    base_vocal = np.pad(original_vocal, ((0, max(0, b - len(original_vocal))), (0, 0)))[a:b]
    envelope = np.ones((count, 1), dtype='float32')
    fade = min(round(.08 * rate), count // 2)
    if fade: envelope[:fade, 0] = np.linspace(0, 1, fade); envelope[-fade:, 0] = np.linspace(1, 0, fade)
    repaired = original.copy()
    repaired[a:b] += (patch - base_vocal) * envelope
    subtype = source_info.subtype if source_info.subtype in {'PCM_16', 'PCM_24', 'PCM_32', 'FLOAT'} else 'PCM_24'
    sf.write(output, np.clip(repaired, -1, 1), rate, subtype=subtype)
    save_receipt(work / 'repair-manifest.json', {**manifest, 'applied': True, 'phrase_start': phrase_start, 'phrase_end': phrase_end})
