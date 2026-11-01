import base64
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import types
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio_production_analysis import analyze_payload, audio_structure, subject_track


class ProductionAnalysisTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='studio-cpu-analysis-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.ffmpeg = os.environ.get('STUDIO_FFMPEG_PATH') or shutil.which('ffmpeg')

    def test_measured_beats_silence_and_cache_cleanup(self):
        import librosa
        import numpy as np
        import soundfile as sf
        sr = 22050
        samples = librosa.clicks(times=np.arange(.5, 12, .5), sr=sr, length=sr*12).astype('float32')
        path = self.root / 'clicks.wav'
        sf.write(path, samples, sr, subtype='PCM_16')
        result = audio_structure(path)
        self.assertFalse(result['silent'])
        self.assertTrue(112 <= result['tempo_bpm'] <= 128, result)
        self.assertGreaterEqual(len(result['beat_times']), 18)
        # Every measured beat is near the known half-second click grid.
        self.assertLess(max(abs(value*2-round(value*2)) / 2 for value in result['beat_times']), .06)
        self.assertEqual(result['sections'][0]['start'], 0)
        self.assertAlmostEqual(result['sections'][-1]['end'], 12)
        self.assertTrue(all(item['review_required'] for item in result['sections']))
        worker = types.SimpleNamespace(root=self.root, ffmpeg=self.ffmpeg)
        body = {'action': 'audio_structure', 'media': base64.b64encode(path.read_bytes()).decode()}
        first = analyze_payload(worker, body)
        cache = self.root / 'production-analysis-cache'
        old = cache / ('0'*64 + '.json')
        old.write_text('{"expired":true}')
        os.utime(old, (0, 0))
        unrelated = cache / 'user-data.json'
        unrelated.write_text('keep')
        self.assertEqual(first, analyze_payload(worker, body))
        self.assertFalse(old.exists())
        self.assertEqual(unrelated.read_text(), 'keep')
        self.assertEqual(list(self.root.glob('production-analysis-*')), [self.root / 'production-analysis-cache'])
        sf.write(path, np.zeros(sr, dtype='float32'), sr)
        silent = audio_structure(path)
        self.assertTrue(silent['silent'])
        self.assertEqual(silent['beat_times'], [])
        self.assertIsNone(silent['tempo_bpm'])

    def test_bidirectional_tracking_and_scene_cut_requires_review(self):
        if not self.ffmpeg:
            self.skipTest('FFmpeg must be configured for the real CPU tracking test')
        import cv2
        import numpy as np
        width, height, fps, seconds = 240, 144, 24, 4
        source = self.root / 'tracking.mp4'
        command = [self.ffmpeg, '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{width}x{height}', '-r', str(fps), '-i', '-', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', str(source)]
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        rng = np.random.default_rng(42)
        texture = rng.integers(45, 240, (44, 44, 3), dtype=np.uint8)
        for index in range(fps*seconds):
            frame = np.full((height, width, 3), 15 if index < fps*3 else 245, dtype=np.uint8)
            if index < fps*3:
                x = 30 + index//4
                frame[48:92, x:x+44] = texture
            process.stdin.write(frame.tobytes())
        process.stdin.close()
        error = process.stderr.read()
        process.stderr.close()
        self.assertEqual(process.wait(), 0, error.decode())
        result = subject_track(source, self.ffmpeg, {'anchor_time': 1.5, 'roi': {'x': 39/width, 'y': 48/height, 'width': 44/width, 'height': 44/height}, 'target_aspect': 9/16})
        points = result['points']
        before = min(points, key=lambda value: abs(value['time']-.5))
        after = min(points, key=lambda value: abs(value['time']-2.5))
        self.assertGreater(before['confidence'], .5, before)
        self.assertGreater(after['confidence'], .5, after)
        self.assertAlmostEqual(before['roi']['x']*width, 33, delta=3)
        self.assertAlmostEqual(after['roi']['x']*width, 45, delta=3)
        cut = [point for point in points if point['time'] >= 3.05]
        self.assertTrue(all(point['review_required'] and point['confidence'] == 0 for point in cut))
        self.assertTrue(any(point['reason'] == 'scene_cut_or_large_change' for point in cut))
        for point in points:
            crop = point['crop']
            self.assertGreaterEqual(crop['x'], 0)
            self.assertLessEqual(crop['x']+crop['width'], 1.000001)

    def test_rejects_unbounded_or_non_media_inputs_and_cleans_failure(self):
        worker = types.SimpleNamespace(root=self.root, ffmpeg=self.ffmpeg)
        for body in [
            {'action': 'unknown', 'media': 'QQ=='},
            {'action': 'audio_structure', 'media': 'https://example.com/a.wav'},
            {'action': 'audio_structure', 'media': base64.b64encode(b'invalid audio').decode()},
            {'action': 'audio_structure', 'media': '!!!!'},
        ]:
            with self.subTest(body=body):
                with self.assertRaises(Exception):
                    analyze_payload(worker, body)
        self.assertFalse(any(path.is_dir() and path.name.startswith('production-analysis-') and path.name != 'production-analysis-cache' for path in self.root.iterdir()))
        self.assertEqual(list((self.root / 'production-analysis-cache').glob('*.json')), [])

    def test_transcription_keeps_actual_word_confidence_without_inventing_speakers(self):
        from real_audio_worker import MediaWorker
        worker = MediaWorker.__new__(MediaWorker)
        words = [types.SimpleNamespace(start=0, end=.5, word='hello', probability=.76), types.SimpleNamespace(start=.5, end=1, word='world', probability=None)]
        segment = types.SimpleNamespace(start=0, end=1, text='hello world', words=words, avg_logprob=-.25, no_speech_prob=.02)
        worker.asr = types.SimpleNamespace(transcribe=lambda *args, **kwargs: ([segment], types.SimpleNamespace(duration=1, language='en')))
        result = worker.transcribe(self.root / 'already-decoded.wav')
        self.assertEqual(result['words'][0]['confidence'], .76)
        self.assertNotIn('confidence', result['words'][1])
        self.assertEqual(result['segments'][0]['avg_logprob'], -.25)
        self.assertEqual(result['segments'][0]['no_speech_prob'], .02)
        self.assertNotIn('speaker', result['words'][0])
        self.assertNotIn('confidence', result['segments'][0])


if __name__ == '__main__':
    unittest.main()
