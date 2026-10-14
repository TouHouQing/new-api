"""Install the pinned official CTranslate2 Whisper Small model."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler

REVISION = '536b0662742c02347bc0e980a01041f333bce120'
FILES = {
    'model.bin': ('sha256', '3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671'),
    'config.json': ('git', 'e5047537059bd8f182d9ca64c470201585015187'),
    'tokenizer.json': ('git', '7818adb6de9fa3064d3ff81226fdd675be1f6344'),
    'vocabulary.txt': ('git', 'c9074644d9d1205686f16d411564729461324b75'),
}


def digest(path, kind):
    data = path.read_bytes()
    if kind == 'git': return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    return hashlib.sha256(data).hexdigest()


def install(directory, mirror=False):
    target = Path(directory).resolve() / 'asr-models' / 'whisper-small'
    target.mkdir(parents=True, exist_ok=True)
    origin = 'https://hf-mirror.com' if mirror else 'https://huggingface.co'
    opener = build_opener(ProxyHandler({}))
    files = []
    for name, (kind, expected) in FILES.items():
        path, partial = target / name, target / (name + '.download')
        if not path.is_file():
            for attempt in range(6):
                try:
                    offset = partial.stat().st_size if partial.exists() else 0
                    headers = {'User-Agent': 'new-api-studio-local/1.0'}
                    if offset: headers['Range'] = f'bytes={offset}-'
                    url = f'{origin}/Systran/faster-whisper-small/resolve/{REVISION}/{name}'
                    with opener.open(Request(url, headers=headers), timeout=45) as response:
                        ranged = response.status == 206
                        if ranged and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'): raise ValueError('Invalid ASR download range')
                        with partial.open('ab' if ranged else 'wb') as output:
                            while chunk := response.read(1024 * 1024): output.write(chunk)
                    if digest(partial, kind) != expected: raise ValueError('ASR model differs from the published revision')
                    partial.replace(path)
                    break
                except Exception:
                    if attempt == 5: raise
        if digest(path, kind) != expected: raise ValueError('Existing ASR model differs; original file preserved')
        files.append({'file': name, 'digest_type': kind, 'digest': expected})
        print('Verified', name, flush=True)
    receipt = {'publisher': 'Systran/faster-whisper-small', 'revision': REVISION, 'license': 'MIT', 'files': files}
    (target / 'installation-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--mirror', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install(args.directory, args.mirror), indent=2))
