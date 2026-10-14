"""Download published TripoSR weights, verify SHA-256, preserve interrupted files."""
import argparse
import hashlib
import json
import time
import os
import zipfile
from pathlib import Path
from urllib.request import Request, build_opener, ProxyHandler


def verified_file(opener, url, path, expected, limit):
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(path.suffix + '.download')
        with opener.open(Request(url, headers={'User-Agent': 'new-api-studio-local/1.0'}), timeout=60) as response, partial.open('wb') as target:
            count = 0
            while chunk := response.read(1024*1024):
                count += len(chunk)
                if count > limit: raise ValueError('Model download exceeds its pinned size limit')
                target.write(chunk)
        with partial.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest != expected: raise ValueError('Downloaded model digest differs; partial file preserved')
        partial.replace(path)
    with path.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != expected: raise ValueError('Existing model differs; preserved ' + path.name)
    return {'file': str(path), 'sha256': digest, 'source': url}


def install(directory, mirror=False, comfy_directory=None):
    directory = Path(directory).resolve()
    target = directory / 'mesh-models'
    target.mkdir(parents=True, exist_ok=True)
    origin = 'https://hf-mirror.com' if mirror else 'https://huggingface.co'
    opener = build_opener(ProxyHandler({}))
    source_revision = '107cefdc244c39106fa830359024f6a2f1c78871'
    archive = directory / 'TripoSR-pinned-source.zip'
    source_receipt = verified_file(opener, 'https://codeload.github.com/VAST-AI-Research/TripoSR/zip/'+source_revision, archive, 'a7b3871a1b4377bef96cbfb99bdc952bdd4f5df9f65fea4208d978a343fd1162', 40<<20)
    source_root = directory / 'TripoSR'
    with zipfile.ZipFile(archive) as package:
        if package.comment.decode() != source_revision: raise ValueError('Source archive revision differs')
        for item in package.infolist():
            if item.is_dir(): continue
            relative = Path(*Path(item.filename).parts[1:])
            destination = (source_root / relative).resolve()
            if not destination.is_relative_to(source_root.resolve()) or item.file_size > 40<<20: raise ValueError('Invalid source archive path')
            data = package.read(item)
            if destination.is_file():
                if destination.read_bytes() != data: raise ValueError('Existing TripoSR source differs; preserved '+str(relative))
            else:
                destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(data)
    home_directory = Path(os.environ['USERPROFILE'])
    comfy_directory = Path(comfy_directory) if comfy_directory else home_directory / 'Desktop/Data/Packages/ComfyUI'
    engine_receipts = [source_receipt,
        verified_file(opener, 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', home_directory/'.u2net/u2netp.onnx', '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8', 5<<20),
        verified_file(opener, 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth', comfy_directory/'models/upscale_models/RealESRGAN_x4plus.pth', '4fa0d38905f75ac06eb49a7951b426670021be3018265fd191d2125df9d682f1', 68<<20)]
    # Published repository revision and checkpoint SHA-256 are pinned. The
    # publisher exposes this digest on the official model.ckpt file page.
    revision = '5b521936b01fbe1890f6f9baed0254ab6351c04a'
    checkpoint_sha = '429e2c6b22a0923967459de24d67f05962b235f79cde6b032aa7ed2ffcd970ee'
    receipts = []
    for filename in ['config.yaml', 'model.ckpt']:
        expected = checkpoint_sha if filename == 'model.ckpt' else '74ca708ce086bf68e97709ea6b3d91f14717921c04691e84043f0eb8fcc68e62'
        path, partial = target / filename, target / (filename + '.download')
        if path.exists():
            with path.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if expected and digest != expected: raise ValueError('Existing model differs; preserved ' + filename)
            receipts.append({'file': filename, 'sha256': digest, 'revision': revision})
            continue
        url = f'{origin}/stabilityai/TripoSR/resolve/{revision}/{filename}'
        for attempt in range(6):
            offset = partial.stat().st_size if partial.exists() else 0
            try:
                headers = {'User-Agent': 'Mozilla/5.0 new-api-studio-local/1.0'}
                if offset: headers['Range'] = f'bytes={offset}-'
                with opener.open(Request(url, headers=headers), timeout=45) as response:
                    ranged = response.status == 206
                    if ranged and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'): raise ValueError('Invalid download range')
                    with partial.open('ab' if ranged else 'wb') as stream:
                        checkpoint = time.monotonic()
                        while chunk := response.read(1024 * 1024):
                            stream.write(chunk)
                            if time.monotonic() - checkpoint > 20:
                                print(filename, 'MiB', stream.tell() // 1024**2, flush=True)
                                checkpoint = time.monotonic()
                with partial.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
                if expected and digest != expected: raise ValueError('Model checksum does not match published LFS metadata')
                partial.replace(path)
                receipts.append({'file': filename, 'sha256': digest, 'revision': revision})
                break
            except Exception:
                if attempt == 5: raise
        print('Verified', filename, flush=True)
    receipt = {'publisher': 'stabilityai/TripoSR', 'source_origin': origin, 'source_revision': source_revision, 'files': receipts, 'engines': engine_receipts}
    dino = target / 'dino-config.json'
    verified_file(opener, origin+'/facebook/dino-vitb16/resolve/main/config.json', dino, 'b87c0270b97db085fd82cf114a761fd0f62ae7914fbd407c752a2260646b689c', 16384)
    config = json.loads(dino.read_text())
    if config.get('model_type') != 'vit' or config.get('hidden_size') != 768: raise ValueError('Unexpected DINO image-encoder architecture')
    receipt['image_encoder_config_sha256'] = hashlib.sha256(dino.read_bytes()).hexdigest()
    (target / 'installation-receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True)
    parser.add_argument('--mirror', action='store_true')
    parser.add_argument('--comfy-directory')
    args = parser.parse_args()
    print(json.dumps(install(args.directory, args.mirror, args.comfy_directory), indent=2))
