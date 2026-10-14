"""Install the pinned Apache-2.0 CLAP audio classifier in the private runtime."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

REVISION = '8fa0f1c'
WEIGHT_SHA = '1cd3c601bc4afe0fa87be3de4c13dd2cfadd249fac1e29acf74a9b296c3219bb'
FILES = ['config.json', 'preprocessor_config.json', 'merges.txt', 'vocab.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'pytorch_model.bin']


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--mirror', action='store_true')
    options = parser.parse_args()
    root = Path(options.directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    origin = 'https://hf-mirror.com' if options.mirror else 'https://huggingface.co'
    receipts = []
    for filename in FILES:
        target = root / filename
        if not target.exists():
            request = Request(f'{origin}/laion/clap-htsat-unfused/resolve/{REVISION}/{filename}', headers={'User-Agent': 'new-api-studio-local/1.0'})
            temporary = root / (filename + '.download')
            with urlopen(request, timeout=60) as response, temporary.open('wb') as stream:
                for block in iter(lambda: response.read(4 * 1024 * 1024), b''):
                    stream.write(block)
            actual = digest(temporary)
            if filename == 'pytorch_model.bin' and actual != WEIGHT_SHA:
                raise RuntimeError('Official CLAP weight checksum mismatch; download preserved')
            temporary.replace(target)
        actual = digest(target)
        if filename == 'pytorch_model.bin' and actual != WEIGHT_SHA:
            raise RuntimeError('Existing CLAP weight checksum mismatch; file preserved')
        receipts.append({'filename': filename, 'sha256': actual, 'bytes': target.stat().st_size})
        print(filename, 'verified', flush=True)
    (root / 'installed.json').write_text(json.dumps({'repository': 'laion/clap-htsat-unfused', 'revision': REVISION, 'files': receipts}, indent=2), encoding='utf-8')
