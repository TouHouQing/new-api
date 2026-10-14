"""Local media worker using real Chatterbox, Whisper, ACE-Step and MuseTalk.

Model files and optional MuseTalk checkout live outside the repository. This
service binds to loopback and never substitutes a fixture for failed inference.
"""
import argparse
import base64
import hashlib
import json
import math
import os
import queue
import sqlite3
import socket
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from studio_inference_lease import gpu_lease
from studio_comfy_receipts import find_prompt, save_receipt


class MediaHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class MediaWorker:
    def __init__(self, root, ffmpeg, comfy='http://127.0.0.1:8188', music_comfy=None):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / 'voices').mkdir(exist_ok=True)
        self.ffmpeg = ffmpeg
        for endpoint in [comfy, music_comfy or comfy]:
            if urlparse(endpoint).hostname not in {'127.0.0.1', 'localhost', '::1'}: raise ValueError('The local ComfyUI endpoint must use loopback')
        self.comfy = comfy.rstrip('/')
        self.music_comfy = (music_comfy or comfy).rstrip('/')
        self.lock = threading.Lock()
        self.tts = None
        self.tts_mtl = None
        self.asr = None
        with self.db() as db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT, request TEXT, result TEXT, error TEXT)')
            db.execute("UPDATE jobs SET status='uncertain',error='Worker restarted; inspect saved receipt before resubmitting' WHERE status='processing'")
        threading.Thread(target=self.run, daemon=True).start()

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.root / 'jobs.db', timeout=30)
        try:
            db.row_factory = sqlite3.Row
            with db: yield db
        finally: db.close()

    def request(self, url, body=None):
        data = None if body is None else json.dumps(body).encode()
        with urlopen(Request(url, data=data, headers={'Content-Type': 'application/json'}), timeout=1800) as response:
            raw = response.read()
            return json.loads(raw) if raw.strip() else {}

    def reference(self, reference, target):
        value = reference['url']
        if value.startswith('data:'):
            raw = base64.b64decode(value.split(',', 1)[1], validate=True)
        else:
            parsed = urlparse(value)
            if parsed.scheme != 'http' or parsed.hostname not in ['127.0.0.1', 'localhost']:
                raise ValueError('Local worker accepts data URLs or loopback media only')
            with urlopen(value, timeout=60) as response:
                if urlparse(response.url).hostname not in ['127.0.0.1', 'localhost']:
                    raise ValueError('Media redirect left loopback')
                raw = response.read(32 * 1024 * 1024 + 1)
        if len(raw) > 32 * 1024 * 1024:
            raise ValueError('Reference exceeds 32 MiB')
        target.write_bytes(raw)
        return target

    def speech_response(self, body):
        format_name = body.get('response_format', 'mp3')
        formats = {'wav': ('pcm_s16le', 'audio/wav'), 'mp3': ('libmp3lame', 'audio/mpeg'), 'flac': ('flac', 'audio/flac'), 'aac': ('aac', 'audio/aac'), 'opus': ('libopus', 'audio/ogg'), 'pcm': ('pcm_s16le', 'application/octet-stream')}
        if not isinstance(format_name, str) or format_name not in formats:
            raise ValueError('Unsupported speech audio format')
        speed = body.get('speed', 1)
        if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not math.isfinite(speed) or not .25 <= speed <= 4:
            raise ValueError('Speech speed must be between 0.25 and 4')
        output = self.root / ('speech-' + uuid.uuid4().hex + '.wav')
        converted = None
        try:
            with self.lock:
                self.speech(body['input'], body.get('voice', 'default'), output, body.get('language', ''), {'speed': speed, 'pitch': 0, 'pause': 0})
            codec, mime = formats[format_name]
            if format_name != 'wav':
                converted = output.with_suffix('.' + ('ogg' if format_name == 'opus' else format_name))
                arguments = [self.ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(output), '-c:a', codec]
                if format_name == 'pcm': arguments.extend(['-f', 's16le'])
                subprocess.run([*arguments, str(converted)], check=True, timeout=120, stderr=subprocess.PIPE)
            return (converted or output).read_bytes(), mime
        finally:
            output.unlink(missing_ok=True)
            output.with_name(output.stem + '-expression.wav').unlink(missing_ok=True)
            if converted: converted.unlink(missing_ok=True)

    def speech(self, text, voice, output, language='', expression=None):
        import torch
        import soundfile as sf
        from chatterbox.tts import ChatterboxTTS
        torch.set_num_threads(6)
        multilingual = language not in ['', 'en'] or any('\u4e00' <= char <= '\u9fff' for char in text)
        if multilingual:
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS
            if self.tts_mtl is None:
                self.tts_mtl = ChatterboxMultilingualTTS.from_pretrained('cpu')
            model = self.tts_mtl
        else:
            if self.tts is None:
                self.tts = ChatterboxTTS.from_pretrained('cpu')
            model = self.tts
        reference = None
        if voice and voice not in ['default', 'alloy']:
            if not all(char.isalnum() or char in '-_' for char in voice):
                raise ValueError('Invalid voice ID')
            reference = self.root / 'voices' / (voice + '.wav')
            if not reference.is_file():
                raise ValueError('Voice is unavailable')
        if not text.strip() or len(text) > 3000:
            raise ValueError('Split dialogue into segments of at most 3000 characters')
        options = {'audio_prompt_path': str(reference) if reference else None}
        if expression and 'expression' in expression:
            options['exaggeration'] = expression['expression']
        if multilingual:
            options['language_id'] = language or 'zh'
        wav = model.generate(text, **options)
        sf.write(output, wav.squeeze().detach().cpu().numpy(), model.sr)
        if expression:
            pitch = 2 ** (expression.get('pitch', 0) / 12)
            speed = expression.get('speed', 1)
            pause = expression.get('pause', 0)
            # Preserve independent tempo and pitch controls. atempo handles the
            # small supported ratio without changing the requested pitch shift.
            filters = [f'asetrate={model.sr * pitch}', f'aresample={model.sr}']
            tempo = speed / pitch
            while tempo > 2:
                filters.append('atempo=2')
                tempo /= 2
            while tempo < .5:
                filters.append('atempo=0.5')
                tempo *= 2
            filters.append(f'atempo={tempo}')
            if pause:
                filters.extend([f'adelay={round(pause * 1000)}:all=1', f'apad=pad_dur={pause}'])
            processed = output.with_name(output.stem + '-expression.wav')
            subprocess.run([self.ffmpeg, '-nostdin', '-v', 'error', '-y', '-i', str(output), '-af', ','.join(filters), '-c:a', 'pcm_s16le', str(processed)], check=True, timeout=120, stderr=subprocess.PIPE)
            processed.replace(output)
        # Leave room for video and lip-sync models on a shared workstation.
        self.tts = None
        self.tts_mtl = None
        del model
        import gc
        gc.collect()

    def transcribe(self, audio, language=None):
        from faster_whisper import WhisperModel
        if self.asr is None:
            model_path = self.root.parent / 'asr-models' / 'whisper-small'
            if not (model_path / 'model.bin').is_file(): raise ValueError('Install the pinned local Whisper Small model before transcription')
            self.asr = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=6, local_files_only=True)
        segments, info = self.asr.transcribe(str(audio), language=language or None, beam_size=3, word_timestamps=True)
        values, words = [], []
        for index, item in enumerate(segments):
            values.append({'id': index, 'start': max(0, min(item.start, info.duration)), 'end': min(item.end, info.duration), 'text': item.text})
            words.extend({'start': word.start, 'end': word.end, 'text': word.word} for word in (item.words or []) if word.end > word.start)
        values = [item for item in values if item['end'] > item['start']]
        return {'text': ' '.join(item['text'] for item in values), 'language': info.language, 'duration': info.duration, 'segments': values, 'words': words}

    def music(self, job_id, body, output):
        seconds = float(body['seconds'])
        if not 1 <= seconds <= 30:
            raise ValueError('Local ACE-Step generation supports 1 to 30 seconds')
        tags = body['prompt']
        options = body.get('options') or {}
        lyrics = options.get('lyrics', '') if options.get('music_mode') == 'song' else '[Instrumental]'
        seed = options.get('seed', 0)
        path = output.parent / 'music-receipt.json'
        receipt = json.loads(path.read_text(encoding='utf-8')) if path.is_file() else {}
        signature = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
        if receipt.get('signature') and receipt['signature'] != signature:
            raise ValueError('The saved music source differs from this request')
        comfy = receipt.get('engine', self.music_comfy)
        if urlparse(comfy).hostname not in {'127.0.0.1', 'localhost', '::1'}: raise ValueError('The saved music engine must use loopback')
        generation_seconds = receipt.get('generated_seconds', seconds if options.get('music_mode') == 'song' else 30.0)
        if body['operation'] == 'sound_effects':
            tags += ', environmental soundscape, sound effects, no vocals, no melody'
        graph = {
            '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'acestep_v1.5_turbo.safetensors', 'weight_dtype': 'default'}},
            '2': {'class_type': 'DualCLIPLoader', 'inputs': {'clip_name1': 'qwen_0.6b_ace15.safetensors', 'clip_name2': 'qwen_1.7b_ace15.safetensors', 'type': 'ace', 'device': 'default'}},
            '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'ace_1.5_vae.safetensors'}},
            '4': {'class_type': 'TextEncodeAceStepAudio1.5', 'inputs': {'clip': ['2', 0], 'tags': tags, 'lyrics': lyrics, 'seed': seed, 'bpm': options.get('bpm', 90), 'duration': generation_seconds, 'timesignature': '4', 'language': body.get('language') or 'en', 'keyscale': 'C major', 'generate_audio_codes': True, 'cfg_scale': 2, 'temperature': .85, 'top_p': .9, 'top_k': 0, 'min_p': 0}},
            '5': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['4', 0]}},
            '6': {'class_type': 'EmptyAceStep1.5LatentAudio', 'inputs': {'seconds': generation_seconds, 'batch_size': 1}},
            '7': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 3}},
            '8': {'class_type': 'KSampler', 'inputs': {'model': ['7', 0], 'positive': ['4', 0], 'negative': ['5', 0], 'latent_image': ['6', 0], 'seed': seed, 'steps': 8, 'cfg': 1, 'sampler_name': 'euler', 'scheduler': 'simple', 'denoise': 1}},
            '9': {'class_type': 'VAEDecodeAudio', 'inputs': {'samples': ['8', 0], 'vae': ['3', 0]}},
            '10': {'class_type': 'SaveAudio', 'inputs': {'audio': ['9', 0], 'filename_prefix': 'studio-audio/' + job_id}},
        }
        if not receipt:
            pending = self.request(comfy + '/queue')
            if pending.get('queue_running') or pending.get('queue_pending'):
                raise ValueError('The music engine is busy; wait for its current task before retrying')
            receipt = {'engine': comfy, 'signature': signature, 'generated_seconds': generation_seconds, 'request': graph}
            save_receipt(path, receipt)
            response = self.request(comfy + '/prompt', {'prompt': graph, 'extra_data': {'studio_request_id': job_id}})
            receipt['prompt_id'] = response['prompt_id']
            save_receipt(path, receipt)
        elif not receipt.get('prompt_id'):
            prompt_id = find_prompt(self.request, comfy, job_id)
            if not prompt_id: raise RuntimeError('Music submission is unresolved; inspect its saved receipt before retrying')
            receipt['prompt_id'] = prompt_id
            save_receipt(path, receipt)
        prompt_id = receipt['prompt_id']
        with self.db() as db:
            db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps({'prompt_id': prompt_id, 'comfy_url': comfy}), job_id))
        deadline = time.monotonic() + 1800
        while time.monotonic() < deadline:
            entry = {'outputs': {'saved': {'audio': [receipt['output']]}}} if receipt.get('output') else self.request(comfy + '/history/' + prompt_id).get(prompt_id)
            if entry:
                if entry.get('status', {}).get('status_str') == 'error':
                    raise RuntimeError('ComfyUI audio inference failed: ' + json.dumps(entry['status']['messages'])[-2000:])
                for value in entry.get('outputs', {}).values():
                    for item in value.get('audio', []):
                        from urllib.parse import urlencode
                        receipt['output'] = item
                        save_receipt(path, receipt)
                        with urlopen(comfy + '/view?' + urlencode(item), timeout=60) as response:
                            original = output.with_suffix('.generated')
                            original.write_bytes(response.read())
                        try:
                            subprocess.run([self.ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(original), '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', str(output)], check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                            source_offset = 0.0
                            if seconds < generation_seconds:
                                import numpy as np
                                import soundfile as sf
                                signal, rate = sf.read(output, dtype='float32', always_2d=True)
                                if not np.isfinite(signal).all(): raise ValueError('Generated audio contains invalid samples')
                                source = output.with_name('generation-source.wav')
                                output.replace(source)
                                length = int(round(seconds * rate))
                                candidates = range(0, max(1, len(signal) - length + 1), rate)
                                start = max(candidates, key=lambda offset: float(np.mean(signal[offset:offset + length]**2)))
                                selected = signal[start:start + length].copy()
                                fade = min(int(.05 * rate), len(selected) // 2)
                                if fade:
                                    selected[:fade] *= np.linspace(0, 1, fade)[:, None]
                                    selected[-fade:] *= np.linspace(1, 0, fade)[:, None]
                                sf.write(output, selected, rate, subtype='PCM_16')
                                source_offset = start / rate
                            with self.db() as db:
                                row = db.execute('SELECT result FROM jobs WHERE id=?', (job_id,)).fetchone()
                                if row is not None:
                                    result = json.loads(row['result'] or '{}')
                                    result.update({'generated_seconds': generation_seconds, 'source_offset': source_offset})
                                    db.execute('UPDATE jobs SET result=? WHERE id=?', (json.dumps(result), job_id))
                                # Nested vocal repairs own a durable music receipt, not a second job row.
                                receipt.update({'generated_seconds': generation_seconds, 'source_offset': source_offset})
                                save_receipt(path, receipt)
                        finally:
                            original.unlink(missing_ok=True)
                        return
                raise RuntimeError('ComfyUI returned no audio output')
            time.sleep(1)
        raise TimeoutError('ComfyUI audio inference did not finish')

    def submit(self, body):
        from studio_media_tools import IMAGE_ACTIONS, AUDIO_ACTIONS, validate_options
        from studio_video_object_edit import VIDEO_ACTIONS, validate_edit
        action = body.get('operation')
        if action not in {'voice_clone', 'voice_speech', 'music', 'sound_effects', 'lip_sync', 'video_depth', *IMAGE_ACTIONS, *AUDIO_ACTIONS, *VIDEO_ACTIONS}:
            raise ValueError('Unsupported media operation')
        seconds = float(body.get('seconds', 0))
        if not 0 < seconds <= 3600:
            raise ValueError('Invalid duration')
        if action == 'music' and seconds > 30:
            raise ValueError('Local music drafts support at most thirty seconds')
        validate_options(body)
        if action in VIDEO_ACTIONS: validate_edit(body)
        job_id = 'audio-' + uuid.uuid4().hex
        with self.db() as db:
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?)', (job_id, 'queued', json.dumps(body), '{}', ''))
        return {'id': job_id, 'status': 'queued'}

    def recover_tool_receipt(self, row):
        if row['status'] != 'uncertain': return row
        body = json.loads(row['request'])
        action = body.get('operation')
        if action in ['music', 'sound_effects']:
            path = self.root / row['id'] / ('repair-song/music-receipt.json' if body.get('options', {}).get('repair_end') is not None else 'music-receipt.json')
            if path.is_file(): receipt = json.loads(path.read_text(encoding='utf-8'))
            else:
                previous = json.loads(row['result'] or '{}')
                if not previous.get('prompt_id'): return row
                receipt = {'engine': previous.get('comfy_url', self.comfy), 'prompt_id': previous['prompt_id'], 'generated_seconds': previous.get('generated_seconds', 30.0)}
                path.parent.mkdir(parents=True, exist_ok=True)
            engine = receipt['engine']
            if urlparse(engine).hostname not in {'127.0.0.1', 'localhost', '::1'}: raise ValueError('The saved music engine must use loopback')
            prompt_id = receipt.get('prompt_id') or find_prompt(self.request, engine, row['id'] + ('-phrase' if body.get('options', {}).get('repair_end') is not None else ''))
            if not prompt_id: return row
            receipt['prompt_id'] = prompt_id
            if not receipt.get('output'):
                completed = self.request(engine + '/history/' + prompt_id).get(prompt_id)
                if not completed:
                    pending = self.request(engine + '/queue')
                    if not any(item[1] == prompt_id for item in [*pending.get('queue_running', []), *pending.get('queue_pending', [])]): return row
            save_receipt(path, receipt)
            with self.db() as db:
                db.execute("UPDATE jobs SET status='queued',error='' WHERE id=? AND status='uncertain'", (row['id'],))
                return db.execute('SELECT * FROM jobs WHERE id=?', (row['id'],)).fetchone()
        if action not in {'image_layers', 'image_outpaint', 'image_grid', 'image_upscale'}: return row
        work = self.root / row['id']
        if action == 'image_grid':
            receipts = sorted(work.glob('panel-*/flux-receipt.json'))
            if not receipts: return row
            for path in receipts:
                receipt = json.loads(path.read_text())
                key = receipt.get('request', {}).get('idempotency_key', '')
                if not key: return row
                task = self.request('http://127.0.0.1:13003/studio-local/v1/images/jobs/' + (receipt.get('id') or 'image-' + key[:32]))
                if task['status'] == 'failed' or task['status'] == 'uncertain' and not task.get('prompt_id'): return row
            with self.db() as db:
                db.execute("UPDATE jobs SET status='queued',error='' WHERE id=? AND status='uncertain'", (row['id'],))
                return db.execute('SELECT * FROM jobs WHERE id=?', (row['id'],)).fetchone()
        path = work / ('upscale-receipt.json' if action == 'image_upscale' else 'flux-receipt.json')
        if not path.is_file(): return row
        receipt = json.loads(path.read_text())
        if action == 'image_upscale':
            prompt = receipt.get('prompt_id') or find_prompt(self.request, self.comfy, work.name + '-upscale')
            if not prompt: return row
            receipt['prompt_id'] = prompt; save_receipt(path, receipt)
        else:
            key = receipt.get('request', {}).get('idempotency_key', '')
            if not key: return row
            task = self.request('http://127.0.0.1:13003/studio-local/v1/images/jobs/' + (receipt.get('id') or 'image-' + key[:32]))
            if task['status'] == 'failed' or (task['status'] == 'uncertain' and not task.get('prompt_id')): return row
        with self.db() as db:
            db.execute("UPDATE jobs SET status='queued',error='' WHERE id=? AND status='uncertain'", (row['id'],))
            return db.execute('SELECT * FROM jobs WHERE id=?', (row['id'],)).fetchone()

    def run(self):
        while True:
            with self.db() as db:
                row = db.execute("SELECT * FROM jobs WHERE status='queued' LIMIT 1").fetchone()
                if row:
                    claimed = db.execute("UPDATE jobs SET status='processing' WHERE id=? AND status='queued'", (row['id'],)).rowcount
                    if not claimed: row = None
            if not row:
                time.sleep(.2)
                continue
            body = json.loads(row['request'])
            action, job_id = body['operation'], row['id']
            work = self.root / job_id
            work.mkdir(exist_ok=True)
            output = work / ('output.mp4' if action == 'lip_sync' else 'output.wav')
            try:
                voice = body.get('voice_id', '')
                from studio_media_tools import IMAGE_ACTIONS, AUDIO_ACTIONS, image_tool, audio_tool
                from studio_video_object_edit import VIDEO_ACTIONS, edit_video_object
                if action == 'video_depth':
                    from studio_video_depth import extract_video_depth
                    result = extract_video_depth(self, body, work)
                    with self.db() as db:
                        db.execute("UPDATE jobs SET status='completed',result=?,error='' WHERE id=?", (json.dumps({**result, 'id': job_id, 'status': 'completed', 'progress': 100}), job_id))
                    continue
                if action in VIDEO_ACTIONS:
                    result = edit_video_object(self, body, work)
                    with self.db() as db:
                        db.execute("UPDATE jobs SET status='completed',result=?,error='' WHERE id=?", (json.dumps({**result, 'id': job_id, 'status': 'completed', 'progress': 100}), job_id))
                    continue
                if action in IMAGE_ACTIONS | AUDIO_ACTIONS:
                    result = image_tool(self, body, work) if action in IMAGE_ACTIONS else audio_tool(self, body, work)
                    with self.db() as db:
                        db.execute("UPDATE jobs SET status='completed',result=?,error='' WHERE id=?", (json.dumps({**result, 'id': job_id, 'status': 'completed', 'progress': 100}), job_id))
                    continue
                if action == 'voice_clone':
                    if body.get('confirm_voice_rights') is not True:
                        raise ValueError('Voice permission was not confirmed')
                    reference = next(item for item in body['references'] if item['type'] == 'audio')
                    source = self.reference(reference, work / 'reference.bin')
                    voice = 'voice-' + uuid.uuid4().hex
                    target = self.root / 'voices' / (voice + '.wav')
                    subprocess.run([self.ffmpeg, '-nostdin', '-y', '-v', 'error', '-i', str(source), '-ar', '24000', '-ac', '1', '-t', '20', str(target)], check=True, timeout=60)
                    with self.lock:
                        self.speech(body['prompt'] or 'This is the cloned voice.', voice, output, body.get('language', ''), body.get('options'))
                elif action == 'voice_speech':
                    with self.lock:
                        self.speech(body['prompt'], voice, output, body.get('language', ''), body.get('options'))
                elif action in ['music', 'sound_effects']:
                    with gpu_lease(self.root.parent):
                        try:
                            if body.get('options', {}).get('repair_end') is not None:
                                from studio_lyrics import repair_song
                                repair_song(self, job_id, body, output)
                            else:
                                self.music(job_id, body, output)
                        finally:
                            try:
                                path = work / 'music-receipt.json'
                                engine = json.loads(path.read_text(encoding='utf-8'))['engine'] if path.is_file() else self.music_comfy
                                pending = self.request(engine + '/queue')
                                if not pending.get('queue_running') and not pending.get('queue_pending'):
                                    self.request(engine + '/free', {'unload_models': True, 'free_memory': True})
                            except Exception:
                                print('Local GPU cleanup deferred; retained the inference receipt.', flush=True)
                else:
                    from studio_musetalk import synchronize
                    audio = self.reference(next(item for item in body['references'] if item['type'] == 'audio'), work / 'audio.bin')
                    video = self.reference(next(item for item in body['references'] if item['type'] == 'video'), work / 'video.bin')
                    with gpu_lease(self.root.parent):
                        synchronize(self.root.parent / 'MuseTalk', video, audio, output, self.ffmpeg, float(body['seconds']))
                if action == 'lip_sync':
                    probe = subprocess.check_output([str(Path(self.ffmpeg).with_name('ffprobe' + Path(self.ffmpeg).suffix)), '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', str(output)], timeout=30)
                    seconds = float(probe)
                else:
                    import soundfile as sf
                    seconds = sf.info(output).duration
                    if action in ['music', 'sound_effects']:
                        import numpy as np
                        signal, _ = sf.read(output, dtype='float32')
                        if not np.isfinite(signal).all() or float(np.sqrt(np.mean(signal**2))) < .003:
                            raise ValueError('Generated audio is nearly silent; change the prompt or use a different source before delivery')
                with self.db() as db:
                    partial = db.execute('SELECT result FROM jobs WHERE id=?', (job_id,)).fetchone()
                    result = {**json.loads(partial['result'] or '{}'), 'id': job_id, 'status': 'completed', 'progress': 100, 'seconds': float(body['seconds']) if body.get('options', {}).get('repair_end') is not None else seconds, 'actual_seconds': seconds, 'voice_id': voice, 'output': {'type': 'video' if action == 'lip_sync' else 'audio', 'mime_type': 'video/mp4' if action == 'lip_sync' else 'audio/wav'}, 'path': str(output)}
                    if action == 'music' and body.get('options', {}).get('music_mode') == 'song':
                        from studio_lyrics import song_artifacts
                        result['artifacts'] = song_artifacts(self, body, work, output)
                    db.execute("UPDATE jobs SET status='completed',result=?,error='' WHERE id=?", (json.dumps(result), job_id))
            except Exception as error:
                receipt_exists = any(work.rglob('*-receipt.json'))
                status = 'uncertain' if receipt_exists and isinstance(error, (TimeoutError, ConnectionError, OSError)) else 'failed'
                if receipt_exists and 'unresolved' in str(error): status = 'uncertain'
                with self.db() as db:
                    db.execute("UPDATE jobs SET status=?,error=? WHERE id=?", (status, str(error)[:2000], job_id))
                print(action, 'failed:', error, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--port', type=int, default=13004)
    parser.add_argument('--comfy', default='http://127.0.0.1:8188')
    parser.add_argument('--music-comfy')
    args = parser.parse_args()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, value, content_type='application/json', status=200):
            raw = json.dumps(value).encode() if content_type == 'application/json' and not isinstance(value, (bytes, bytearray)) else value
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            if self.command != 'HEAD': self.wfile.write(raw)

        def do_GET(self):
            if self.path == '/health':
                return self.send({'real_inference': True, 'music_comfy': worker.music_comfy, 'engines': ['Chatterbox', 'Whisper', 'ACE-Step', 'MuseTalk', 'U2Net', 'Real-ESRGAN', 'FLUX', 'Demucs', 'TripoSR']})
            if self.path.startswith('/studio-media/v1/jobs/'):
                job_id = self.path.split('/')[4]
                with worker.db() as db:
                    row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
                if not row:
                    return self.send({'error': 'Job unavailable'}, status=404)
                try: row = worker.recover_tool_receipt(row)
                except Exception as error: return self.send({'id': job_id, 'status': 'uncertain', 'error': 'Saved tool recovery is unavailable: ' + str(error)[:1000]})
                result = json.loads(row['result'])
                if urlparse(self.path).path.endswith('/content'):
                    if row['status'] != 'completed':
                        return self.send({'error': 'Job is incomplete'}, status=409)
                    key = parse_qs(urlparse(self.path).query).get('key', ['output'])[0]
                    item = next((item for item in result.get('artifacts', []) if item['key'] == key), None)
                    if item is None and key == 'output': item = {'path': result['path'], 'mime_type': result['output']['mime_type']}
                    if item is None: return self.send({'error': 'Artifact unavailable'}, status=404)
                    target = Path(item['path']).resolve()
                    if not target.is_relative_to(worker.root / job_id): return self.send({'error': 'Artifact outside job directory'}, status=403)
                    return self.send(target.read_bytes(), item['mime_type'])
                result.pop('path', None)
                result['artifacts'] = [{key: value for key, value in item.items() if key != 'path'} for item in result.get('artifacts', [])]
                return self.send({**result, 'id': job_id, 'status': row['status'], 'error': row['error']})
            self.send({'error': 'Endpoint unavailable'}, status=404)

        do_HEAD = do_GET
        def do_POST(self):
            try:
                size = int(self.headers.get('Content-Length', 0))
                if not 0 < size <= 40 * 1024 * 1024:
                    return self.send({'error': 'Invalid request size'}, status=413)
                raw = self.rfile.read(size)
                if self.path == '/v1/audio/transcriptions':
                    message = BytesParser(policy=default).parsebytes(('Content-Type: ' + self.headers['Content-Type'] + '\r\nMIME-Version: 1.0\r\n\r\n').encode() + raw)
                    parts = {part.get_param('name', header='content-disposition'): part.get_payload(decode=True) for part in message.iter_parts()}
                    work = worker.root / ('asr-' + uuid.uuid4().hex)
                    work.mkdir()
                    audio = work / 'audio.bin'
                    audio.write_bytes(parts['file'])
                    try:
                        with worker.lock:
                            result = worker.transcribe(audio, parts.get('language', b'').decode() or None)
                        return self.send(result)
                    finally:
                        audio.unlink(missing_ok=True)
                        work.rmdir()
                body = json.loads(raw)
                if self.path == '/audio-analysis':
                    work = worker.root / ('analysis-' + uuid.uuid4().hex)
                    work.mkdir()
                    audio = work / 'audio.wav'
                    encoded = body.get('audio', '')
                    if not isinstance(encoded, str) or len(encoded) > 16 * 1024 * 1024:
                        raise ValueError('Audio analysis input exceeds the local limit')
                    audio.write_bytes(base64.b64decode(encoded, validate=True))
                    try:
                        from studio_audio_analysis import analyze
                        with worker.lock:
                            result = analyze(worker, audio)
                        return self.send(result)
                    finally:
                        audio.unlink(missing_ok=True)
                        work.rmdir()
                if self.path == '/studio-media/v1/jobs':
                    return self.send(worker.submit(body))
                if self.path == '/v1/audio/speech':
                    audio, mime = worker.speech_response(body)
                    return self.send(audio, mime)
                self.send({'error': 'Endpoint unavailable'}, status=404)
            except Exception as error:
                self.send({'error': {'message': str(error)[:2000]}}, status=400)

    server = MediaHTTPServer(('127.0.0.1', args.port), Handler)
    worker = MediaWorker(args.directory, args.ffmpeg, args.comfy, args.music_comfy)
    print('Real local audio worker ready on loopback:', args.port, flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
