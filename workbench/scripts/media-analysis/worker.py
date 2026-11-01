"""Private stateless CPU worker. Native Yingce owns tasks, sources and versions."""
import argparse
import base64
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from importlib.metadata import version as package_version
import json
import os
from pathlib import Path
import re
import socket
import tempfile
import threading
import time

from measurements import analyze, ENGINE_VERSION

MAX_MEDIA = 24 << 20
MAX_BODY = 34 << 20
MAX_RESULT = 2 << 20
CODE_SHA256=hashlib.sha256(Path(__file__).read_bytes()+Path(__file__).with_name('measurements.py').read_bytes()+Path(__file__).with_name('requirements.txt').read_bytes()).hexdigest()


def strict_object(pairs):
    result = {}
    for name,value in pairs:
        if name in result:
            raise ValueError('Duplicate request field')
        result[name]=value
    return result


class Worker:
    def __init__(self, root, ffmpeg, token):
        if root.is_symlink() or not root.is_dir():
            raise ValueError('Worker root must be an existing plain directory')
        self.root,self.ffmpeg,self.token=root.resolve(),str(ffmpeg.resolve(strict=True)),token
        dependencies={name:package_version(name) for name in ['numpy','librosa','soundfile','opencv-python-headless']}
        self.engine_sha256=hashlib.sha256((CODE_SHA256+json.dumps(dependencies,sort_keys=True)).encode()).hexdigest()
        self.cache=self.root/'analysis-cache-v1'
        if self.cache.is_symlink():
            raise ValueError('Worker cache cannot be a symbolic link')
        self.cache.mkdir(exist_ok=True)
        self.slot=threading.BoundedSemaphore(1)
        self.nonce_lock=threading.Lock()
        self.nonces={}

    def authorized(self, path, headers, raw):
        stamp,nonce,signature=(headers.get(name,'') for name in ['X-Yingce-Analysis-Time','X-Yingce-Analysis-Nonce','X-Yingce-Analysis-Signature'])
        if not re.fullmatch(r'[0-9]{10,12}',stamp) or abs(time.time()-int(stamp))>120 or not re.fullmatch(r'[a-f0-9]{32}',nonce) or not re.fullmatch(r'[a-f0-9]{64}',signature):
            return False
        message='POST\n'+path+'\n'+stamp+'\n'+nonce+'\n'+hashlib.sha256(raw).hexdigest()
        expected=hmac.new(self.token,message.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected,signature):
            return False
        with self.nonce_lock:
            now=time.time()
            self.nonces={key:expiry for key,expiry in self.nonces.items() if expiry>now}
            if nonce in self.nonces or len(self.nonces)>=4096:
                return False
            self.nonces[nonce]=now+240
        return True

    def prune(self):
        entries=[]
        now=time.time()
        for path in self.cache.iterdir():
            if path.is_symlink() or not path.is_file() or not re.fullmatch(r'[a-f0-9]{64}\.(json|tmp)',path.name):
                continue
            stat=path.stat()
            if path.suffix=='.tmp':
                if now-stat.st_mtime>86400:
                    path.unlink(missing_ok=True)
            else:
                entries.append((stat.st_mtime,stat.st_size,path))
        size=sum(item[1] for item in entries)
        for modified,length,path in sorted(entries):
            if now-modified>7*86400 or size>64<<20:
                path.unlink(missing_ok=True)
                size-=length

    def execute(self, body):
        if not isinstance(body,dict) or set(body)!={'engineVersion','engineSHA256','action','media','options'} or type(body['engineVersion']) is not int or body['engineVersion']!=ENGINE_VERSION or body['engineSHA256']!=self.engine_sha256:
            raise ValueError('Unsupported analysis contract')
        action,encoded,options=body['action'],body['media'],body['options']
        if action not in ('audio_structure','reference_video','subject_track') or not isinstance(encoded,str) or not 1<=len(encoded)<=32<<20 or not isinstance(options,dict):
            raise ValueError('Invalid analysis input')
        raw=base64.b64decode(encoded,validate=True)
        if not 1<=len(raw)<=MAX_MEDIA:
            raise ValueError('Normalized media exceeds 24 MiB')
        digest=hashlib.sha256(raw).hexdigest()
        key=hashlib.sha256(raw+json.dumps({'engineVersion':ENGINE_VERSION,'engineSHA256':self.engine_sha256,'action':action,'options':options},sort_keys=True,allow_nan=False).encode()).hexdigest()
        receipt=self.cache/(key+'.json')
        self.prune()
        if receipt.is_symlink():
            raise ValueError('Invalid cache entry')
        if receipt.is_file():
            if receipt.stat().st_size>MAX_RESULT:
                raise ValueError('Cached result exceeds the limit')
            cached=json.loads(receipt.read_bytes())
            if cached.get('cache_key')==key and cached.get('input_digest')==digest and cached.get('engine_version')==ENGINE_VERSION and cached.get('engine_sha256')==self.engine_sha256:
                return cached
            raise ValueError('Cached analysis identity mismatch')
        with tempfile.TemporaryDirectory(prefix='native-analysis-',dir=self.root) as directory:
            media=Path(directory)/('source.wav' if action=='audio_structure' else 'source.mp4')
            media.write_bytes(raw)
            result=analyze(media,self.ffmpeg,action,options)
        result.update({'input_digest':digest,'cache_key':key,'engine_sha256':self.engine_sha256})
        encoded=json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
        if len(encoded)>MAX_RESULT:
            raise ValueError('Analysis result exceeds 2 MiB')
        temporary=receipt.with_suffix('.tmp')
        if temporary.is_symlink():
            raise ValueError('Invalid temporary cache entry')
        if temporary.exists():
            if not temporary.is_file():
                raise ValueError('Invalid temporary cache entry')
            temporary.unlink()
        try:
            with temporary.open('xb') as file:
                file.write(encoded)
                file.flush()
            temporary.replace(receipt)
            self.prune()
        finally:
            temporary.unlink(missing_ok=True)
        return result


def handler(worker):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self,*args):
            pass

        def respond(self,status,value):
            data=json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode()
            try:
                self.send_response(status)
                self.send_header('Content-Type','application/json; charset=utf-8')
                self.send_header('Content-Length',str(len(data)))
                self.send_header('Cache-Control','no-store')
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError,ConnectionResetError,socket.timeout):
                pass

        def do_GET(self):
            if self.path!='/health':
                return self.respond(404,{'error':'not_found'})
            ready=all(importlib.util.find_spec(name) is not None for name in ['numpy','librosa','soundfile','cv2'])
            return self.respond(200 if ready else 503,{'status':'ok' if ready else 'unavailable','engineVersion':ENGINE_VERSION,'engineSHA256':worker.engine_sha256,'actions':['reference_video','audio_structure','subject_track'] if ready else [],'modelCalls':False})

        def do_POST(self):
            if self.path not in ('/v1/analyze','/v1/verify'):
                return self.respond(404,{'error':'not_found'})
            length=self.headers.get('Content-Length','')
            if self.headers.get('Transfer-Encoding') or not length.isdecimal() or not 1<=int(length)<=MAX_BODY:
                return self.respond(413,{'error':'body_limit'})
            try:
                raw=self.rfile.read(int(length))
                if len(raw)!=int(length):
                    return self.respond(400,{'error':'incomplete_body'})
                if not worker.authorized(self.path,self.headers,raw):
                    return self.respond(401,{'error':'authentication_required'})
                body=json.loads(raw,object_pairs_hook=strict_object)
            except (ValueError,socket.timeout):
                return self.respond(400,{'error':'invalid_request'})
            if self.path=='/v1/verify':
                if not isinstance(body,dict) or set(body)!={'engineVersion','engineSHA256'} or type(body['engineVersion']) is not int or body['engineVersion']!=ENGINE_VERSION or body['engineSHA256']!=worker.engine_sha256:
                    return self.respond(409,{'error':'engine_changed'})
                return self.respond(200,{'status':'ok','engineVersion':ENGINE_VERSION,'engineSHA256':worker.engine_sha256})
            if isinstance(body,dict) and (body.get('engineVersion')!=ENGINE_VERSION or body.get('engineSHA256')!=worker.engine_sha256):
                return self.respond(409,{'error':'engine_changed'})
            if not worker.slot.acquire(timeout=1):
                return self.respond(503,{'error':'analysis_busy','retryable':True})
            try:
                return self.respond(200,worker.execute(body))
            except (ValueError,KeyError,TypeError,json.JSONDecodeError) as error:
                return self.respond(422,{'error':'analysis_input','message':str(error)[:500]})
            except Exception:
                return self.respond(500,{'error':'analysis_failed','message':'CPU measurement failed; original media is retained'})
            finally:
                worker.slot.release()
    return Handler


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--ffmpeg',type=Path,required=True)
    parser.add_argument('--token-file',type=Path,required=True)
    parser.add_argument('--port',type=int,default=13005)
    args=parser.parse_args()
    if args.token_file.is_symlink() or not args.token_file.is_file() or args.token_file.stat().st_size>256:
        raise ValueError('Invalid private worker token file')
    token=args.token_file.read_bytes().strip()
    if not 32<=len(token)<=128 or not 1<=args.port<=65535:
        raise ValueError('Invalid private worker configuration')
    worker=Worker(args.directory,args.ffmpeg,token)
    os.environ.setdefault('NUMBA_CACHE_DIR',str(worker.root/'numba-cache'))
    os.environ.setdefault('NUMBA_NUM_THREADS','2')
    os.environ.setdefault('OMP_NUM_THREADS','2')
    os.environ.setdefault('OPENBLAS_NUM_THREADS','2')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler(worker))
    server.daemon_threads=True
    print(json.dumps({'status':'listening','port':args.port,'engineVersion':ENGINE_VERSION}),flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()


if __name__=='__main__':
    main()
