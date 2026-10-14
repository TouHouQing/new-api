"""Regression for JSON files returned by the local media worker over HTTP.

Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License,
version 3 or later. See <https://www.gnu.org/licenses/>.
"""
import json
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen


class AudioArtifactHTTPTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='studio-audio-http-')
        cls.root = Path(cls.temporary.name).resolve()
        assert cls.root.parent == Path(tempfile.gettempdir()).resolve()
        folder = cls.root / 'audio-http-case'
        folder.mkdir()
        cls.raw = '{"segments": [{"text": "你好"}]}\n'.encode('utf8')
        source = folder / 'transcript.json'
        source.write_bytes(cls.raw)
        with sqlite3.connect(cls.root / 'jobs.db') as db:
            db.execute('CREATE TABLE jobs (id TEXT PRIMARY KEY, status TEXT, request TEXT, result TEXT, error TEXT)')
            result = {'path': str(source), 'output': {'type': 'file', 'mime_type': 'application/json'}, 'artifacts': [{'key': 'transcript', 'type': 'file', 'mime_type': 'application/json', 'path': str(source)}]}
            db.execute('INSERT INTO jobs VALUES (?,?,?,?,?)', ('audio-http-case', 'completed', json.dumps({'action': 'audio_translate'}), json.dumps(result), ''))
        db.close()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.base = f'http://127.0.0.1:{port}'
        worker = Path(__file__).resolve().parents[1] / 'real_audio_worker.py'
        cls.process = subprocess.Popen([sys.executable, '-B', '-X', 'utf8', str(worker), '--directory', str(cls.root), '--ffmpeg', 'ffmpeg', '--port', str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with urlopen(cls.base + '/health', timeout=1) as response:
                    assert response.status == 200
                return
            except OSError:
                time.sleep(.1)
        cls.process.terminate()
        raise AssertionError('HTTP test worker did not start')

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)
        cls.process.stderr.close()
        assert cls.root.name.startswith('studio-audio-http-')
        cls.temporary.cleanup()

    def test_json_file_bytes_are_served_verbatim(self):
        with urlopen(self.base + '/studio-media/v1/jobs/audio-http-case/content?key=transcript', timeout=3) as response:
            self.assertEqual(response.headers.get('Content-Type'), 'application/json')
            self.assertEqual(response.read(), self.raw)

    def test_json_metadata_remains_an_object(self):
        with urlopen(self.base + '/studio-media/v1/jobs/audio-http-case', timeout=3) as response:
            result = json.load(response)
        self.assertEqual(result['id'], 'audio-http-case')
        self.assertEqual(result['status'], 'completed')
        self.assertNotIn('path', result['artifacts'][0])

    def test_head_json_file_has_the_exact_byte_length(self):
        request = Request(self.base + '/studio-media/v1/jobs/audio-http-case/content?key=transcript', method='HEAD')
        with urlopen(request, timeout=3) as response:
            self.assertEqual(int(response.headers['Content-Length']), len(self.raw))
            self.assertEqual(response.read(), b'')


if __name__ == '__main__':
    unittest.main()
