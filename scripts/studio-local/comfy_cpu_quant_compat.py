"""Apply the known CPU capability fix to the installed local ComfyUI runtime."""
import argparse
import hashlib
from pathlib import Path


def patch_cpu_quantization(comfy_directory, backup_directory):
    source = Path(comfy_directory).resolve() / 'comfy' / 'model_management.py'
    original = source.read_text(encoding='utf-8')
    updated = original
    changed = []
    for name in ['supports_fp8_compute', 'supports_nvfp4_compute', 'supports_mxfp8_compute']:
        header = f'def {name}(device=None):\n'
        guard = '    if device is not None and is_device_cpu(device):\n        return False\n\n'
        if header + guard in updated:
            continue
        if header not in updated:
            raise RuntimeError('The local ComfyUI capability interface changed: ' + name)
        updated = updated.replace(header, header + guard, 1)
        changed.append(name)
    if not changed:
        return []
    compile(updated, str(source), 'exec')
    backups = Path(backup_directory).resolve()
    backups.mkdir(parents=True, exist_ok=True)
    checksum = hashlib.sha256(source.read_bytes()).hexdigest()
    backup = backups / ('model_management-' + checksum[:16] + '.py')
    if not backup.exists():
        backup.write_bytes(source.read_bytes())
    source.write_text(updated, encoding='utf-8')
    return changed


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--comfy-directory', required=True)
    parser.add_argument('--backup-directory', required=True)
    arguments = parser.parse_args()
    changed = patch_cpu_quantization(arguments.comfy_directory, arguments.backup_directory)
    print('Local CPU quantization compatibility: ' + (', '.join(changed) if changed else 'already applied'))
