"""Verify local inference keeps working without a desktop proxy."""
import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.error import URLError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from local_model_adapter import LocalModels, LocalInferenceFailure, LocalServiceUnavailable, local_task_failure_status

class LocalHTTPTests(unittest.TestCase):
    def test_json_and_reference_upload_bypass_unavailable_proxy(self):
        requests=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def do_POST(self):
                requests.append((self.path,self.headers.get('Content-Type'),self.rfile.read(int(self.headers['Content-Length']))))
                data=json.dumps({'name':'reference.png','subfolder':'test','ok':True}).encode()
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        models=LocalModels.__new__(LocalModels);models.args=SimpleNamespace(comfy='http://127.0.0.1:'+str(server.server_port))
        try:
            with patch.dict(os.environ,{'http_proxy':'http://127.0.0.1:9','https_proxy':'http://127.0.0.1:9','no_proxy':'','NO_PROXY':''}):
                self.assertTrue(models.http_json(models.args.comfy+'/json',{'prompt':'hello'})['ok'])
                self.assertEqual(models.upload_reference(b'real-image-bytes','image/png'),'test/reference.png')
            self.assertEqual([r[0] for r in requests],['/json','/upload/image'])
            self.assertEqual(json.loads(requests[0][2]),{'prompt':'hello'})
            self.assertIn(b'real-image-bytes',requests[1][2])
        finally:server.shutdown();server.server_close();worker.join()
    def test_connection_refusal_is_a_known_terminal_failure(self):
        models=LocalModels.__new__(LocalModels)
        with patch('urllib.request.OpenerDirector.open',side_effect=URLError(ConnectionRefusedError(10061,'connection refused'))):
            with self.assertRaisesRegex(LocalInferenceFailure,'not accepting connections'):
                models.http_json('http://127.0.0.1:11434/api/chat',{'prompt':'hello'},timeout=2)

    def test_receipt_loss_after_submission_is_not_safe_to_regenerate(self):
        error = LocalServiceUnavailable('engine stopped')
        self.assertEqual(local_task_failure_status(error, {}), 'failed')
        self.assertEqual(local_task_failure_status(error, {'stage':'submitting'}), 'failed')
        self.assertEqual(local_task_failure_status(error, {'prompt_id':'accepted'}), 'uncertain')
        self.assertEqual(local_task_failure_status(LocalInferenceFailure('confirmed execution failure'), {'prompt_id':'accepted'}), 'failed')
        self.assertEqual(local_task_failure_status(URLError('response lost'), {'stage':'submitting'}), 'uncertain')

if __name__=='__main__':unittest.main()
