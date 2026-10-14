"""Offline Studio upstream. Generates fixtures with FFmpeg; never calls a model."""
import argparse
import base64
import json
import subprocess
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg', required=True)
    parser.add_argument('--directory', required=True)
    parser.add_argument('--port', type=int, default=13002)
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    fixtures = {
        'image.png': ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-frames:v', '1'],
        'video.mp4': ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
        'audio.mp3': ['-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '2', '-c:a', 'libmp3lame'],
    }
    for name, options in fixtures.items():
        if not (directory / name).exists():
            subprocess.run([args.ffmpeg, '-nostdin', '-y', '-v', 'error', *options, str(directory / name)], check=True)
    tasks = {}
    media_tasks = {}
    models = ['gpt-4o-mini', 'gpt-image-1', 'sora-2', 'tts-1', 'whisper-1', 'studio-music', 'studio-sound-effects', 'studio-voice-clone', 'studio-voice-speech', 'studio-lip-sync']
    counts = {}
    screenplay = {
        'title': 'Local test film', 'brief': 'A courier delivers a red package at sunrise',
        'characters': [{'id': 'courier', 'title': 'Courier', 'description': 'A courier in a blue jacket', 'voice': 'calm'}],
        'scenes': [{'id': 'street', 'title': 'Morning street', 'description': 'A quiet street at sunrise'}],
        'props': [{'id': 'package', 'title': 'Red package', 'description': 'A small red box'}],
        'shots': [{'id': 'shot-one', 'title': 'Arrival', 'sceneId': 'street', 'characterIds': ['courier'], 'propIds': ['package'], 'text': 'The courier arrives', 'imagePrompt': 'Courier and red package on a sunrise street', 'videoPrompt': 'Courier walks toward the camera', 'seconds': 2, 'camera': 'Wide shot, slow dolly', 'dialogue': 'Your package is here'}],
    }

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, value, content_type='application/json', status=200):
            data = json.dumps(value, ensure_ascii=False).encode() if content_type == 'application/json' else value
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            route = self.path.split('?')[0]
            if route == '/__local/status':
                return self.send({'offline': True, 'calls': counts, 'tasks': len(tasks)})
            if route == '/v1/models':
                return self.send({'object': 'list', 'data': [{'id': name, 'object': 'model'} for name in models]})
            if route.startswith('/studio-media/v1/jobs/'):
                task_id = route.split('/')[4]
                task = media_tasks.get(task_id)
                if not task:
                    return self.send({'error': {'message': 'Unknown local media task'}}, status=404)
                video = task['operation'] == 'lip_sync'
                if route.endswith('/content'):
                    return self.send((directory / ('video.mp4' if video else 'audio.mp3')).read_bytes(), 'video/mp4' if video else 'audio/mpeg')
                return self.send({'id': task_id, 'status': 'completed', 'progress': 100, 'seconds': task['seconds'], 'voice_id': 'local-fixture-voice' if task['operation'] == 'voice_clone' else '', 'output': {'type': 'video' if video else 'audio', 'mime_type': 'video/mp4' if video else 'audio/mpeg'}})
            if route.startswith('/v1/videos/'):
                task_id = route.split('/')[3]
                if task_id not in tasks:
                    return self.send({'error': {'message': 'Unknown local fixture task'}}, status=404)
                if route.endswith('/content'):
                    return self.send((directory / 'video.mp4').read_bytes(), 'video/mp4')
                elapsed = time.time() - tasks[task_id]
                return self.send({'id': task_id, 'object': 'video', 'model': 'sora-2', 'status': 'completed' if elapsed >= 1 else 'in_progress', 'progress': 100 if elapsed >= 1 else 50, 'seconds': '2', 'size': '1280x720', 'created_at': int(tasks[task_id]), 'completed_at': int(time.time()) if elapsed >= 1 else None})
            return self.send({'error': {'message': 'Unsupported offline endpoint'}}, status=404)

        def do_POST(self):
            route = self.path.split('?')[0]
            size = int(self.headers.get('Content-Length', '0'))
            if size > 40 * 1024 * 1024:
                return self.send({'error': {'message': 'Local request too large'}}, status=413)
            raw = self.rfile.read(size)
            counts[route] = counts.get(route, 0) + 1
            payload = {}
            if 'application/json' in self.headers.get('Content-Type', ''):
                try:
                    payload = json.loads(raw)
                except ValueError:
                    return self.send({'error': {'message': 'Invalid fixture JSON'}}, status=400)
            if payload.get('model') and payload['model'] not in models:
                return self.send({'error': {'message': 'Model is not in the local fixture allowlist'}}, status=400)
            if route == '/v1/chat/completions':
                system = str(payload.get('messages', [{}])[0].get('content', ''))
                content = json.dumps(screenplay, ensure_ascii=False) if 'production plan' in system else json.dumps({'text': 'A courier on a morning street', 'image_prompt': 'Courier in a blue jacket with red box', 'video_prompt': 'Courier walks toward camera'})
                return self.send({'id': 'chatcmpl-local', 'object': 'chat.completion', 'model': payload.get('model', 'gpt-4o-mini'), 'choices': [{'index': 0, 'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}], 'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}})
            if route in ['/v1/images/generations', '/v1/images/edits']:
                return self.send({'created': int(time.time()), 'data': [{'b64_json': base64.b64encode((directory / 'image.png').read_bytes()).decode()}], 'usage': {'input_tokens': 0, 'output_tokens': 0, 'total_tokens': 0}})
            if route == '/v1/audio/speech':
                return self.send((directory / 'audio.mp3').read_bytes(), 'audio/mpeg')
            if route == '/v1/audio/transcriptions':
                return self.send({'text': 'Your package is here', 'duration': 2, 'segments': [{'id': 0, 'start': 0, 'end': 2, 'text': 'Your package is here'}]})
            if route == '/v1/videos':
                task_id = 'video-local-' + uuid.uuid4().hex
                tasks[task_id] = time.time()
                return self.send({'id': task_id, 'object': 'video', 'model': 'sora-2', 'status': 'queued', 'progress': 0, 'seconds': '2', 'size': '1280x720', 'created_at': int(tasks[task_id])})
            if route == '/studio-media/v1/jobs':
                task_id = 'media-local-' + uuid.uuid4().hex
                media_tasks[task_id] = payload
                return self.send({'id': task_id, 'status': 'queued'})
            return self.send({'error': {'message': 'Unsupported offline endpoint'}}, status=404)

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Offline Studio upstream: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
