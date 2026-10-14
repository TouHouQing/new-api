"""Install pinned official VACE weights without changing running ComfyUI.

The mirror is a transport fallback only. Every completed file must match the
SHA-256 published on the official Comfy-Org model repository before activation.
Interrupted downloads stay outside ComfyUI's model extensions and can resume.
"""
import argparse
import hashlib
import json
import shutil
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPOSITORY = 'Comfy-Org/Wan_2.1_ComfyUI_repackaged'
WEIGHTS = [
    ('diffusion_models', 'wan2.1_vace_1.3B_fp16.safetensors', '640ccc0577e6a5d4bb15cd91b11b699ef914fc55f126c5a1c544e152130784f2'),
    ('vae', 'wan_2.1_vae.safetensors', '2fc39d31359a4b0a64f55876d8ff7fa8d780956ae2cb13463b0223e15148976b'),
]


def checksum(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def install(root, mirror=False):
    assert (root / 'main.py').is_file() and (root / 'comfy').is_dir(), 'Use the existing ComfyUI root'
    origin = 'https://hf-mirror.com' if mirror else 'https://huggingface.co'
    receipts = []
    for folder, filename, expected in WEIGHTS:
        directory = root / 'models' / folder
        directory.mkdir(parents=True, exist_ok=True)
        target = directory / filename
        if target.exists():
            if checksum(target) != expected:
                raise RuntimeError('Existing model checksum differs; preserved existing file: ' + filename)
        else:
            partial = directory / (filename + '.download')
            url = f'{origin}/{REPOSITORY}/resolve/main/split_files/{folder}/{filename}'
            last_error = ''
            for attempt in range(5):
                offset = partial.stat().st_size if partial.exists() else 0
                request = Request(url, headers={'User-Agent': 'new-api-studio-local/1.0', 'Range': f'bytes={offset}-'})
                try:
                    with urlopen(request, timeout=45) as response:
                        ranged = response.status == 206
                        if ranged and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                            raise RuntimeError('Unexpected download range')
                        remaining = int(response.headers.get('Content-Length', 0))
                        if remaining and shutil.disk_usage(root).free < remaining + 1024**3:
                            raise RuntimeError('Insufficient free space for model and runtime')
                        mode = 'ab' if ranged else 'wb'
                        received = offset if ranged else 0
                        checkpoint = time.monotonic()
                        with partial.open(mode) as stream:
                            while True:
                                chunk = response.read(4 * 1024 * 1024)
                                if not chunk:
                                    break
                                stream.write(chunk)
                                received += len(chunk)
                                if time.monotonic() - checkpoint >= 20:
                                    print(f'{filename}: {received // (1024**2)} MiB downloaded', flush=True)
                                    checkpoint = time.monotonic()
                    if checksum(partial) != expected:
                        raise RuntimeError('Downloaded model checksum mismatch; partial file preserved')
                    partial.replace(target)
                    break
                except (HTTPError, URLError, TimeoutError, ConnectionError) as error:
                    last_error = type(error).__name__ + ': ' + str(getattr(error, 'code', 'network interrupted'))
                    print(f'{filename}: retry {attempt + 1}; {last_error}', flush=True)
            if not target.exists():
                raise RuntimeError('Model download did not complete: ' + last_error)
        receipt = {'filename': filename, 'sha256': expected, 'bytes': target.stat().st_size, 'source': f'https://huggingface.co/{REPOSITORY}/blob/main/split_files/{folder}/{filename}'}
        receipts.append(receipt)
        print(json.dumps(receipt), flush=True)
    return receipts


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--comfy-root', required=True)
    parser.add_argument('--mirror', action='store_true')
    parser.add_argument('--receipt')
    options = parser.parse_args()
    installed = install(Path(options.comfy_root).resolve(), options.mirror)
    if options.receipt:
        Path(options.receipt).write_text(json.dumps(installed, indent=2), encoding='utf-8')
