import hashlib
import io
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local_model_adapter import LocalModels
from studio_comfy_receipts import find_prompt
from studio_media_tools import flux, upscale


class ImageReceiptRecoveryTest(unittest.TestCase):
    def test_unhealthy_device_rejects_generation_before_enqueuing_a_prompt(self):
        models = LocalModels.__new__(LocalModels)
        models.args = SimpleNamespace(comfy='http://127.0.0.1:8288')
        submitted = []
        def request(url, body=None, timeout=None):
            if body is not None:
                submitted.append(url)
                raise AssertionError('Device failure must not enqueue or free models')
            if url.endswith('/queue'):
                return {'queue_running': [], 'queue_pending': []}
            raise OSError('CUDA device context is unavailable')
        models.http_json = request
        with self.assertRaisesRegex(RuntimeError, 'device health check failed'):
            models.comfy_reference('vace', {}, {})
        self.assertEqual(submitted, [])

    def test_lost_image_prompt_response_is_collected_after_restart_without_posting_again(self):
        state = {'posts': 0, 'request_id': '', 'history': False}
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass
            def do_POST(self):
                state['posts'] += 1
                self.send_response(500); self.end_headers()
            def do_GET(self):
                path = self.path
                if path == '/api/models': value = {'image': ['flux.2-klein-4b'], 'video': [], 'text': []}
                elif path.startswith('/object_info'): value = {}
                elif path == '/queue': value = {'queue_running': [], 'queue_pending': []}
                elif path.startswith('/history'):
                    entry = {'prompt': [0, 'prompt-a', {'save': {'class_type': 'SaveImage'}}, {'studio_request_id': state['request_id']}], 'status': {'completed': True}, 'outputs': {'save': {'images': [{'filename': 'result.png', 'type': 'output'}]}}}
                    value = {'prompt-a': entry} if state['history'] else {}
                else:
                    self.send_response(200); self.end_headers(); self.wfile.write(b'actual saved PNG bytes'); return
                self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(value).encode())
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        self.addCleanup(server.server_close); self.addCleanup(server.shutdown)
        endpoint = f'http://127.0.0.1:{server.server_port}'
        with tempfile.TemporaryDirectory() as temporary:
            args = SimpleNamespace(directory=temporary, gateway=endpoint, comfy=endpoint, workflow_directory=None)
            models = LocalModels(args)
            task = 'image-' + '1'*32; state['request_id'] = task
            with models.connect() as db:
                db.execute('INSERT INTO tasks VALUES (?,?,?,?,?,?)', (task, 'in_progress', '{}', '{"stage":"submitting"}', 1, ''))
            restarted = LocalModels(args)
            self.assertEqual(restarted.recover_video_receipt(task)['status'], 'uncertain')
            state['history'] = True
            recovered = restarted.recover_video_receipt(task)
            self.assertEqual(recovered['status'], 'completed')
            result = json.loads(recovered['result'])
            self.assertEqual(Path(result['output_path']).read_bytes(), b'actual saved PNG bytes')
            self.assertEqual(result['prompt_id'], 'prompt-a')
            self.assertEqual(state['posts'], 0)

    def test_known_upscale_receipt_does_not_upload_or_submit_another_comfy_prompt(self):
        from PIL import Image
        image = Image.new('RGB', (16, 16), 'red'); stream = io.BytesIO(); image.save(stream, format='PNG')
        class Boundary:
            comfy = 'http://127.0.0.1:8288'
            def request(self, url, body=None):
                if body is not None: raise AssertionError('Recovery must never submit')
                return {'saved-prompt': {'prompt': [0, 'saved-prompt', {'4': {'class_type': 'SaveImage'}}], 'outputs': {'4': {'images': [{'filename': 'saved.png', 'type': 'output'}]}}}}
        with tempfile.TemporaryDirectory() as temporary:
            worker = Boundary(); worker.root = Path(temporary) / 'worker'; work = worker.root / 'job'; work.mkdir(parents=True)
            digest = hashlib.sha256(stream.getvalue() + b'2' + worker.comfy.encode()).hexdigest()
            (work / 'upscale-receipt.json').write_text(json.dumps({'signature': digest, 'prompt_id': 'saved-prompt'}))
            with patch('studio_media_tools.urlopen', return_value=io.BytesIO(stream.getvalue())):
                self.assertEqual(upscale(worker, image, work / 'output.png', 2), 'saved-prompt')
            with Image.open(work / 'output.png') as result: self.assertEqual(result.size, (32, 32))

    def test_saved_flux_task_only_polls_and_downloads_the_existing_image(self):
        from PIL import Image
        image = Image.new('RGB', (16, 16), 'green'); stream = io.BytesIO(); image.save(stream, format='PNG')
        class Boundary:
            def request(self, url, body=None):
                if body is not None: raise AssertionError('Existing task must not submit')
                return {'id': 'image-existing', 'status': 'completed'}
        with tempfile.TemporaryDirectory() as temporary:
            work = Path(temporary)
            body = {'model': 'flux.2-klein-4b', 'prompt': 'Garden', 'size': '64x64', 'n': 1, 'response_format': 'b64_json'}
            key = hashlib.sha256((work.name + json.dumps(body, sort_keys=True)).encode()).hexdigest()
            body.update({'idempotency_key': key, 'seed': int(key[:8], 16) % 2**31})
            (work / 'flux-receipt.json').write_text(json.dumps({'id': 'image-existing', 'request': body}))
            with patch('studio_media_tools.urlopen', return_value=io.BytesIO(stream.getvalue())):
                self.assertEqual(flux(Boundary(), 'Garden', (64,64), work).getpixel((0,0)), (0,128,0))

    def test_multiple_matching_prompts_are_left_unresolved(self):
        entry = {'prompt': [0, '', {}, {'studio_request_id': 'saved'}]}
        with self.assertRaisesRegex(RuntimeError, 'Multiple'):
            find_prompt(lambda url: {'a': entry, 'b': entry} if '/history' in url else {}, 'http://127.0.0.1:8288', 'saved')


if __name__ == '__main__': unittest.main()
