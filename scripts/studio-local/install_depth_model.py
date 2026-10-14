"""Install the official small depth model without executing remote code."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler

REVISION = '32d03942121d29edb49de4e2cc15831558af3f36'
WEIGHT_SHA = '3152477ce0d8d6978d76b995120de97cb5b928701fd0f817769f59e249a16b70'


def install(directory, mirror=False):
    target = Path(directory).resolve() / 'depth-models' / 'depth-anything-v2-small'
    target.mkdir(parents=True, exist_ok=True)
    origin = 'https://hf-mirror.com' if mirror else 'https://huggingface.co'
    opener = build_opener(ProxyHandler({}))
    files = []
    for name in ['config.json', 'preprocessor_config.json', 'model.safetensors']:
        path, partial = target / name, target / (name + '.download')
        if not path.is_file():
            for attempt in range(6):
                try:
                    offset = partial.stat().st_size if partial.exists() else 0
                    headers = {'User-Agent': 'new-api-studio-local/1.0'}
                    if offset: headers['Range'] = f'bytes={offset}-'
                    url = f'{origin}/depth-anything/Depth-Anything-V2-Small-hf/resolve/{REVISION}/{name}'
                    with opener.open(Request(url, headers=headers), timeout=45) as response:
                        ranged = response.status == 206
                        if ranged and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                            raise ValueError('Invalid model download range')
                        with partial.open('ab' if ranged else 'wb') as output:
                            while chunk := response.read(1024 * 1024): output.write(chunk)
                    digest = hashlib.sha256(partial.read_bytes()).hexdigest()
                    if name == 'model.safetensors' and digest != WEIGHT_SHA:
                        raise ValueError('Checkpoint differs from official SHA-256; download preserved')
                    partial.replace(path)
                    break
                except Exception:
                    if attempt == 5: raise
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if name == 'model.safetensors' and digest != WEIGHT_SHA:
            raise ValueError('Existing checkpoint differs; file preserved')
        if name == 'config.json' and json.loads(path.read_text())['model_type'] != 'depth_anything':
            raise ValueError('Unexpected depth model architecture')
        files.append({'file': name, 'sha256': digest})
        print('Verified', name, flush=True)
    receipt = {'publisher': 'depth-anything/Depth-Anything-V2-Small-hf', 'revision': REVISION, 'license': 'Apache-2.0', 'origin': origin, 'files': files}
    (target / 'installation-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--mirror', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install(args.directory, args.mirror), indent=2))
