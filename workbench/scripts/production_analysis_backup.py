"""Private bootstrap snapshots for the stateless local CPU analysis service."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import stat
import tarfile

from production_transport_backup import digest, host_path

KEYS = set("version python relayPython ffmpeg directory tokenFile workerPort windowsRelayPort dockerRelayPort".split())
NAMES = {"analysis/config.json", "analysis/token.key"}


def validate_config(value):
    if not isinstance(value, dict) or set(value) != KEYS or type(value.get("version")) is not int or value["version"] != 1:
        raise ValueError("Invalid local analysis bootstrap configuration")
    for key in ("python", "relayPython", "ffmpeg", "directory", "tokenFile"):
        host_path(value[key])
    for key in ("workerPort", "windowsRelayPort", "dockerRelayPort"):
        if type(value[key]) is not int or not 1024 <= value[key] <= 65535:
            raise ValueError("Invalid local analysis bootstrap port")
    return value


def regular_bytes(path, limit):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
        raise ValueError("Analysis bootstrap files must be bounded regular private files")
    return path.read_bytes()


def configured_analysis(directory: Path):
    config = directory / ".local-analysis.json"
    if not config.exists():
        return None
    raw = regular_bytes(config, 8192)
    value = validate_config(json.loads(raw.decode("utf-8-sig")))
    token = host_path(value["tokenFile"])
    secret = regular_bytes(token, 256)
    if re.fullmatch(rb"[a-f0-9]{64}", secret.strip()) is None:
        raise ValueError("Invalid local analysis signing key")
    return {"config": config, "token": token}


def analysis_inventory(configured):
    if configured is None:
        return {}
    return {name: {"source": configured[key], "bytes": len(regular_bytes(configured[key], limit)), "sha256": digest(configured[key])}
            for name, key, limit in (("analysis/config.json", "config", 8192), ("analysis/token.key", "token", 256))}


def native_key_digest(files, environment):
    secret = next((entry.split("=", 1)[1] for entry in environment if entry.startswith("CANVAS_MEDIA_ANALYSIS_SECRET_FILE=")), "")
    path = PurePosixPath(secret)
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Analysis signing key is not bound to the native backup")
    try:
        name = path.relative_to("/data").as_posix()
    except ValueError as error:
        raise ValueError("The native analysis signing key must be backed up with backend data") from error
    if name not in files:
        raise ValueError("The native analysis signing key is missing from backend data")
    return files[name]


def snapshot_analysis(configured, destination: Path, native_token_sha256: str):
    inventory = analysis_inventory(configured)
    if set(inventory) != NAMES or inventory["analysis/token.key"]["sha256"] != native_token_sha256:
        raise ValueError("Analysis service key differs from the backed-up native signing key")
    with destination.open("xb") as stream, tarfile.open(fileobj=stream, mode="w") as archive:
        for name, entry in inventory.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode = entry["bytes"], 0o600
            with entry["source"].open("rb") as source:
                archive.addfile(info, source)
    if inventory != analysis_inventory(configured):
        raise RuntimeError("Analysis bootstrap files changed during backup")
    return {"files": {name: item["sha256"] for name, item in inventory.items()}, "weightsIncluded": False,
            "measurementCacheIncluded": False, "nativeSigningKeyMatched": True}


def verify_analysis_archive(archive_path: Path, proof, output: Path | None = None):
    files = {}
    with tarfile.open(archive_path, "r:") as archive:
        for item in archive:
            if item.name not in NAMES or item.name in files or not item.isfile() or item.size > (8192 if item.name.endswith("config.json") else 256):
                raise ValueError("Invalid analysis bootstrap archive member")
            files[item.name] = archive.extractfile(item).read()
    if set(files) != NAMES or {name: hashlib.sha256(raw).hexdigest() for name, raw in files.items()} != proof.get("files"):
        raise ValueError("Restored analysis bootstrap bytes differ")
    validate_config(json.loads(files["analysis/config.json"].decode("utf-8-sig")))
    if re.fullmatch(rb"[a-f0-9]{64}", files["analysis/token.key"].strip()) is None:
        raise ValueError("Restored analysis signing key is invalid")
    if output is not None:
        output.mkdir(mode=0o700, exist_ok=False)
        for name, raw in files.items():
            target = output / PurePosixPath(name).name
            with target.open("xb") as stream:
                stream.write(raw)
            target.chmod(0o600)
    return files


def native_path(path: Path, windows: bool):
    if os.name != "nt" and windows:
        if len(path.parts) < 4 or path.parts[1] != "mnt" or len(path.parts[2]) != 1:
            raise ValueError("Stage Windows analysis on a mounted Windows drive")
        return str(PureWindowsPath(path.parts[2].upper() + ":/", *path.parts[3:]))
    return str(path)


def stage_analysis_restore(backup: Path, output: Path, repository: Path, ports: tuple[int, int, int]):
    backup, repository = backup.resolve(strict=True), repository.resolve(strict=True)
    output = output.resolve()
    if output.exists() or not (repository / "scripts/media-analysis/worker.py").is_file():
        raise ValueError("Use a fresh private output directory and the current Yingce repository")
    if any(type(port) is not int or not 1024 <= port <= 65535 for port in ports) or len(set(ports)) != 3:
        raise ValueError("Use three distinct private restore ports")
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8-sig"))
    if not manifest.get("localAnalysisIncluded"):
        raise ValueError("This backup has no local analysis bootstrap")
    archive = backup / "local-analysis.tar"
    regular_bytes(archive, 32768)
    if digest(archive) != manifest["archives"]["local-analysis.tar"]:
        raise ValueError("Analysis bootstrap archive checksum differs")
    files = verify_analysis_archive(archive, manifest["localAnalysis"])
    config = json.loads(files["analysis/config.json"].decode("utf-8-sig"))
    windows = bool(re.match(r"^[A-Za-z]:[\\/]", config["directory"]))
    output.mkdir(mode=0o700)
    runtime = output / "runtime"
    runtime.mkdir(mode=0o700)
    token = output / "token.key"
    token.write_bytes(files["analysis/token.key"])
    token.chmod(0o600)
    config.update(directory=native_path(runtime, windows), tokenFile=native_path(token, windows), workerPort=ports[0], windowsRelayPort=ports[1], dockerRelayPort=ports[2])
    owner = {"repository": native_path(repository, windows), "worker": native_path(repository / "scripts/media-analysis/worker.py", windows), "directory": config["directory"],
             "port": ports[0], "pid": 0, "created": datetime.now(timezone.utc).isoformat(), "preparedFromVerifiedArchive": digest(archive)}
    (runtime / ".yingce-worker-owner.json").write_text(json.dumps(owner, indent=2) + "\n")
    destination = output / "config.json"
    destination.write_text(json.dumps(config, indent=2) + "\n")
    destination.chmod(0o600)
    result = {"accepted": True, "config": str(destination), "nativeSigningKeyMatched": manifest["localAnalysis"].get("nativeSigningKeyMatched") is True,
              "liveServicesChanged": False, "measurementCacheCopied": False, "modelInferenceCalls": 0, "archiveSHA256": digest(archive)}
    (output / "restore-stage-receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--repository", required=True, type=Path)
    parser.add_argument("--worker-port", type=int, default=13006)
    parser.add_argument("--windows-port", type=int, default=18006)
    parser.add_argument("--docker-port", type=int, default=18007)
    args = parser.parse_args()
    print(json.dumps(stage_analysis_restore(args.backup, args.output, args.repository, (args.worker_port, args.windows_port, args.docker_port))))
