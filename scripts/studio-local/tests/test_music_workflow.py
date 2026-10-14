import sys
import unittest
import threading
import tempfile
import shutil
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
import io
import json
import math
import struct
import subprocess
import sqlite3
from contextlib import closing

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from real_audio_worker import MediaWorker, MediaHTTPServer


class CapturedWorkflow(Exception):
    pass


class MusicWorkflowTest(unittest.TestCase):
    def test_lyric_check_reports_missing_and_out_of_order_words_without_fuzzy_passes(self):
        from studio_lyrics import compare_lyrics
        lyrics = '[Verse]\nHello my friend\nWe walk together\nHere in the sunlight\nFriends forever'
        missing = compare_lyrics(lyrics, 'Hell, my friend. We walk together. Here in the sunlight, friends.')
        self.assertEqual(missing['status'], 'review_required')
        self.assertEqual([line['matched'] for line in missing['lines']], [False, True, True, False])
        complete = compare_lyrics(lyrics, 'Hello my friend, we walk together, here in the sunlight. Friends forever!')
        self.assertEqual(complete['status'], 'matched')
        reversed = compare_lyrics('Hello my friend\nFriends forever', 'Friends forever, hello my friend')
        self.assertEqual([line['matched'] for line in reversed['lines']], [True, False])

    def test_lyric_check_handles_chinese_punctuation_and_repeated_lines(self):
        from studio_lyrics import compare_lyrics
        self.assertEqual(compare_lyrics('[Verse]\n星光落在你的肩上', '星光，落在你的肩上。')['status'], 'matched')
        self.assertEqual(compare_lyrics('Hello\nHello', 'Hello')['status'], 'review_required')
        self.assertEqual(compare_lyrics('[Instrumental]', '')['status'], 'review_required')

    def test_song_artifacts_keep_the_primary_audio_and_reuse_the_independent_report(self):
        from studio_lyrics import song_artifacts
        worker = MediaWorker.__new__(MediaWorker)
        worker.lock = threading.Lock()
        calls = []
        def recognize(audio, language):
            calls.append((audio, language))
            return {'text': 'Hello'}
        worker.transcribe = recognize
        body = {'language': 'en', 'options': {'lyrics': 'Hello'}}
        result = song_artifacts(worker, body, self.output.parent, self.output)
        self.assertEqual([(item['key'], item['type']) for item in result], [('output', 'audio'), ('lyrics_check', 'file')])
        self.assertEqual(calls, [(self.output, 'en')])
        self.assertEqual(json.loads((self.output.parent / 'lyrics-check.json').read_text())['status'], 'matched')
        self.assertEqual(song_artifacts(worker, body, self.output.parent, self.output), result)
        self.assertEqual(len(calls), 1)

    def test_unavailable_asr_still_reports_that_a_repair_candidate_was_not_applied(self):
        from studio_lyrics import song_artifacts
        worker=MediaWorker.__new__(MediaWorker);worker.lock=threading.Lock();worker.ffmpeg='missing-test-ffmpeg'
        manifest={'applied':False,'start':0,'end':1}
        (self.output.parent/'repair-manifest.json').write_text(json.dumps(manifest))
        song_artifacts(worker,{'options':{'lyrics':'Hello','repair_start':0,'repair_end':1}},self.output.parent,self.output)
        report=json.loads((self.output.parent/'lyrics-check.json').read_text());self.assertEqual(report['status'],'unavailable');self.assertEqual(report['repair'],manifest)

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.output = Path(temporary.name) / 'output.wav'

    def test_speech_rejects_invalid_parameters_before_inference(self):
        worker = MediaWorker.__new__(MediaWorker)
        worker.speech = lambda *args: self.fail('Invalid input must not load a model')
        for body in [{'speed': True}, {'speed': float('nan')}, {'speed': 0}, {'speed': 5}, {'response_format': 'video'}, {'response_format': []}]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                worker.speech_response({'input': 'Hello', **body})

    @unittest.skipUnless(shutil.which('ffmpeg'), 'Real FFmpeg required')
    def test_speech_formats_pass_speed_and_remove_ephemeral_files(self):
        worker = MediaWorker.__new__(MediaWorker)
        worker.ffmpeg = shutil.which('ffmpeg')
        worker.lock = threading.Lock()
        def synthesize(text, voice, output, language, expression):
            self.assertEqual(expression['speed'], 1.5)
            with wave.open(str(output), 'wb') as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(24000)
                audio.writeframes(b'\0\0' * 24000)
        worker.speech = synthesize
        with tempfile.TemporaryDirectory() as folder:
            worker.root = Path(folder)
            for format_name, mime in [('wav', 'audio/wav'), ('mp3', 'audio/mpeg'), ('flac', 'audio/flac'), ('aac', 'audio/aac'), ('opus', 'audio/ogg'), ('pcm', 'application/octet-stream')]:
                with self.subTest(format=format_name):
                    data, actual_mime = worker.speech_response({'input': 'Hello', 'speed': 1.5, 'response_format': format_name})
                    self.assertEqual(actual_mime, mime)
                    self.assertGreater(len(data), 100)
                    self.assertEqual(list(worker.root.iterdir()), [])
            worker.speech = lambda *args: (_ for _ in ()).throw(RuntimeError('Synthesis failed'))
            with self.assertRaises(RuntimeError):
                worker.speech_response({'input': 'Hello'})
            self.assertEqual(list(worker.root.iterdir()), [])

    def test_song_lyrics_language_tempo_and_seed_reach_the_actual_comfy_graph(self):
        worker = MediaWorker.__new__(MediaWorker)
        worker.comfy = 'http://127.0.0.1:8288'
        worker.music_comfy = 'http://127.0.0.1:8188'
        captured = {}
        def capture(url, body=None):
            self.assertTrue(url.startswith(worker.music_comfy))
            if body is None: return {}
            captured.update(body['prompt'])
            raise CapturedWorkflow()
        worker.request = capture
        with self.assertRaises(CapturedWorkflow):
            worker.music('song-contract', {'seconds': 12, 'prompt': 'My original song', 'operation': 'music', 'language': 'zh', 'options': {'music_mode': 'song', 'lyrics': '星光落在你的肩上', 'bpm': 110, 'seed': 7}}, self.output)
        for key, value in {'lyrics': '星光落在你的肩上', 'language': 'zh', 'bpm': 110, 'seed': 7}.items():
            self.assertEqual(captured['4']['inputs'][key], value)
        self.assertEqual(captured['8']['inputs']['seed'], 7)
        self.assertEqual(captured['4']['inputs']['duration'], 12)
        self.assertEqual(captured['6']['inputs']['seconds'], 12)

    def test_invalid_song_settings_are_rejected_before_inference(self):
        from studio_media_tools import validate_options
        for options in [{'music_mode': 'song'}, {'music_mode': 'instrumental', 'lyrics': 'words'}, {'music_mode': 'song', 'lyrics': 'words', 'bpm': 241}, {'music_mode': 'song', 'lyrics': 'words', 'seed': -1}]:
            with self.subTest(options=options), self.assertRaises(ValueError):
                validate_options({'operation': 'music', 'options': options})

    def test_comfy_cleanup_accepts_a_successful_empty_response(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                self.rfile.read(int(self.headers.get('Content-Length', 0)))
                self.send_response(200)
                self.send_header('Content-Length', '0')
                self.end_headers()
            def log_message(self, *args):
                pass
        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            worker = MediaWorker.__new__(MediaWorker)
            self.assertEqual(worker.request(f'http://127.0.0.1:{server.server_port}/free', {'free_memory': True}), {})
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_remote_music_engine_is_rejected_before_a_worker_starts(self):
        with tempfile.TemporaryDirectory() as folder, self.assertRaisesRegex(ValueError, 'loopback'):
            MediaWorker(folder, 'unused', 'http://127.0.0.1:8288', 'https://example.com')

    def test_duplicate_service_start_cannot_modify_an_existing_job(self):
        server = MediaHTTPServer(('127.0.0.1', 0), BaseHTTPRequestHandler)
        self.addCleanup(server.server_close)
        root = self.output.parent
        with closing(sqlite3.connect(root / 'jobs.db')) as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, request TEXT, result TEXT, error TEXT)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?)', ('active', 'processing', '{}', '{}', ''))
            db.commit()
        result = subprocess.run([sys.executable, str(Path(__file__).resolve().parents[1] / 'real_audio_worker.py'), '--directory', str(root), '--ffmpeg', 'unused', '--port', str(server.server_address[1])], capture_output=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        with closing(sqlite3.connect(root / 'jobs.db')) as db:
            self.assertEqual(db.execute("SELECT status FROM jobs WHERE id='active'").fetchone()[0], 'processing')

    @unittest.skipUnless(shutil.which('ffmpeg'), 'Real FFmpeg required')
    def test_lost_music_response_recovers_the_original_engine_and_saved_output_without_resubmitting(self):
        state = {'posts': 0, 'history': False, 'request_id': '', 'graph': None}
        stream = io.BytesIO()
        with wave.open(stream, 'wb') as audio:
            audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(8000)
            audio.writeframes(b''.join(struct.pack('<h', round(5000 * math.sin(index * math.tau * 220 / 8000))) for index in range(96000)))
        native_audio = stream.getvalue()
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                state.update(posts=state['posts'] + 1, request_id=payload['extra_data']['studio_request_id'], graph=payload['prompt'])
                self.send_response(503); self.end_headers()
            def do_GET(self):
                if self.path.startswith('/view'):
                    self.send_response(200); self.end_headers(); self.wfile.write(native_audio); return
                entry = {'prompt': [0, 'music-prompt', state['graph'], {'studio_request_id': state['request_id']}], 'status': {'status_str': 'success'}, 'outputs': {'audio': {'audio': [{'filename': 'song.wav', 'type': 'output'}]}}}
                value = {'music-prompt': entry} if self.path.startswith('/history') and state['history'] else {}
                self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(value).encode())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        endpoint = f'http://127.0.0.1:{server.server_port}'
        worker = MediaWorker.__new__(MediaWorker)
        worker.root = self.output.parent; worker.comfy = endpoint; worker.music_comfy = endpoint; worker.ffmpeg = shutil.which('ffmpeg')
        body = {'operation': 'music', 'prompt': 'An original song', 'seconds': 12, 'options': {'music_mode': 'song', 'lyrics': 'Hello my friend'}}
        job_id = 'saved-song'; work = worker.root / job_id; work.mkdir(); output = work / 'output.wav'
        with worker.db() as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, request TEXT, result TEXT, error TEXT)')
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?)', (job_id, 'uncertain', json.dumps(body), '{}', 'Response lost'))
        with self.assertRaises(OSError): worker.music(job_id, body, output)
        worker.music_comfy = 'http://127.0.0.1:1'
        with worker.db() as db: row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        self.assertEqual(worker.recover_tool_receipt(row)['status'], 'uncertain')
        self.assertEqual(state['posts'], 1)
        state['history'] = True
        self.assertEqual(worker.recover_tool_receipt(row)['status'], 'queued')
        worker.music(job_id, body, output)
        expected = output.read_bytes()
        self.assertGreater(len(expected), 10000)
        state['history'] = False
        worker.music(job_id, body, output)
        self.assertEqual(output.read_bytes(), expected)
        self.assertEqual(state['posts'], 1)
        # A phrase repair has a music receipt but no independent worker job row.
        with worker.db() as db: db.execute('DELETE FROM jobs WHERE id=?', (job_id,))
        worker.music(job_id, body, output)
        self.assertEqual(output.read_bytes(), expected)
        self.assertEqual(state['posts'], 1)
        with self.assertRaisesRegex(ValueError, 'differs'):
            worker.music(job_id, {**body, 'prompt': 'Changed source'}, output)
        self.assertEqual(state['posts'], 1)

    def test_ace_15_uses_its_native_flow_schedule_and_audio_codes(self):
        worker = MediaWorker.__new__(MediaWorker)
        worker.comfy = 'http://127.0.0.1:8288'
        worker.music_comfy = worker.comfy
        captured = {}
        def capture(url, body=None):
            if body is None: return {}
            captured.update(body['prompt'])
            raise CapturedWorkflow()
        worker.request = capture
        with self.assertRaises(CapturedWorkflow):
            worker.music('graph-contract', {'seconds': 8, 'prompt': 'Original piano music', 'operation': 'music'}, self.output)
        self.assertEqual(captured['7']['class_type'], 'ModelSamplingAuraFlow')
        self.assertTrue(captured['4']['inputs']['generate_audio_codes'])
        self.assertEqual(captured['4']['inputs']['duration'], 30)
        self.assertEqual(captured['6']['inputs']['seconds'], 30)


if __name__ == '__main__':
    unittest.main()
