"""Stable private snapshots of configured local transport receipts, without weights."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import shutil
import stat
import tarfile
import uuid

CONFIGS = {"primary": ".local-models.json", "speech": ".local-speech-models.json", "agent": ".local-agent-models.json", "media": ".local-media-models.json"}
CONFIG_KEYS = set("version python moduleDirectory receiptDirectory gatewayPort windowsRelayPort dockerRelayPort comfyUrl ollamaUrl textModel asrPython asrModelDirectory agentTokenizerDirectory targetedCancel speechOnly speechPython speechModelDirectory speechFFmpeg agentOnly mediaOnly mediaPython mediaModel mediaFFmpeg lipSyncModelDirectory".split())
TRANSIENTS = {"input.json", "reference.bin", "reference.wav", "generated.wav", "output.part.wav", "output.part.mp3", "output.part.flac", "output.part.opus"}
SPEECH_FILES = {"result.json", "inference-private.log", "output.wav", "output.mp3", "output.flac", "output.opus"}
MEDIA_ROLES = {"vocals", "instrumental", "drums", "bass", "other"}
MEDIA_FILES = {"result.json", "inference-private.log", *(role + ".wav" for role in MEDIA_ROLES)}
MEDIA_TRANSIENTS = {"input.json", "source.bin", "result.part.json", *(role + ".part.wav" for role in MEDIA_ROLES)}
LIP_SYNC_FILES={"result.json","inference-private.log","output.mp4","lip-timing.json"}
LIP_SYNC_TRANSIENTS={"input.json","source.bin","dialogue.bin","photo-source.mp4","selected-source.mp4","silent.mp4","output.wav","speech-feature-input.wav","output.part.mp4","result.part.json"}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def host_path(raw: str) -> Path:
    if not isinstance(raw, str) or not raw:
        raise ValueError("A local transport receipt directory is required")
    if raw.startswith(("\\\\", "//")):
        raise ValueError("Network receipt paths are not supported by local transport backup")
    if os.name != "nt" and re.match(r"^[A-Za-z]:[\\/]", raw):
        windows = PureWindowsPath(raw)
        return Path("/mnt", windows.drive[0].lower(), *windows.parts[1:])
    path = Path(raw)
    if not path.is_absolute():
        raise ValueError("Transport receipt directories must be absolute local paths")
    return path


def configured_transports(directory: Path) -> list[dict]:
    result = []
    roots = set()
    for slot, name in CONFIGS.items():
        config = directory / name
        if not config.exists():
            continue
        if not stat.S_ISREG(config.lstat().st_mode):
            raise ValueError("Transport configuration must be a regular private file")
        value = json.loads(config.read_text(encoding="utf-8-sig"))
        if not isinstance(value, dict) or set(value) - CONFIG_KEYS or value.get("version") != 1:
            raise ValueError("Unsupported local transport configuration; no writers were stopped")
        receipts = host_path(value.get("receiptDirectory")).resolve(strict=True)
        if not receipts.is_dir() or receipts in roots:
            raise ValueError("Transport receipt directories must exist and be distinct")
        roots.add(receipts)
        result.append({"slot": slot, "config": config, "receipts": receipts})
    return result


def transport_inventory(transports: list[dict]) -> dict:
    inventory = {}

    def include(path, name):
        metadata = path.lstat()
        if not stat.S_ISREG(metadata.st_mode):
            raise ValueError("Transport backups reject links and special files")
        if metadata.st_size > 128 * 1024 * 1024:
            raise ValueError("Transport file exceeds the supported receipt/output bound")
        inventory[name] = {"source": path, "bytes": metadata.st_size, "sha256": digest(path)}

    for transport in transports:
        prefix = "transports/" + transport["slot"]
        include(transport["config"], prefix + "/config.json")
        for path in sorted(transport["receipts"].iterdir()):
            if path.name.startswith("receipt-") and stat.S_ISREG(path.lstat().st_mode):
                continue
            if path.name in {"speech", "media", "lip-sync"} and stat.S_ISDIR(path.lstat().st_mode):
                allowed = {"speech":SPEECH_FILES,"media":MEDIA_FILES,"lip-sync":LIP_SYNC_FILES}[path.name]
                transient = {"speech":TRANSIENTS,"media":MEDIA_TRANSIENTS,"lip-sync":LIP_SYNC_TRANSIENTS}[path.name]
                for job in sorted(path.iterdir()):
                    try:
                        valid = str(uuid.UUID(job.name)) == job.name
                    except ValueError:
                        valid = False
                    if not valid or not stat.S_ISDIR(job.lstat().st_mode):
                        raise ValueError("Invalid local speech execution directory")
                    for output in sorted(job.iterdir()):
                        if output.name in transient and stat.S_ISREG(output.lstat().st_mode):
                            continue
                        if output.name not in allowed:
                            raise ValueError("Unexpected speech cache file; weights and unrelated files are not archived")
                        include(output, prefix + "/receipts/" + path.name + "/" + job.name + "/" + output.name)
                continue
            if not re.fullmatch(r"(?:[a-f0-9]{64}|prompt-[a-fA-F0-9-]{1,128})\.json", path.name):
                raise ValueError("Unexpected transport cache entry; no broad directory backup was attempted")
            include(path, prefix + "/receipts/" + path.name)
            value = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(value, dict) or value.get("version") != 1:
                raise ValueError("Invalid durable transport receipt")
    return inventory


def snapshot_transports(transports: list[dict], destination: Path) -> dict:
    inventory = transport_inventory(transports)
    with destination.open("xb") as stream, tarfile.open(fileobj=stream, mode="w") as archive:
        for name, entry in inventory.items():
            info = tarfile.TarInfo(name)
            info.size, info.mode = entry["bytes"], 0o600
            with entry["source"].open("rb") as source:
                archive.addfile(info, source)
    # Atomic receipt replacement may happen while upstream work completes.
    # A changed snapshot fails visibly instead of claiming a consistent backup.
    if inventory != transport_inventory(transports):
        raise RuntimeError("Local model receipts changed during backup; retained snapshot is not accepted, retry after current inference settles")
    return {"files": {name: value["sha256"] for name, value in inventory.items()}, "slots": [item["slot"] for item in transports], "weightsIncluded": False, "transientInputsIncluded": False, "upstreamComfyHistoryIncluded": False}


def stage_transport_restore(backup: Path, output: Path, port_starts: tuple[int, int, int]) -> dict:
    backup, output = backup.resolve(strict=True), output.resolve()
    if output.exists():
        raise FileExistsError("Restore output must be a new private directory")
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    if not manifest.get("modelTransportsIncluded"):
        raise ValueError("This backup does not contain local model transports")
    proof = manifest["modelTransports"]
    slots = proof["slots"]
    if not slots or len(slots) != len(set(slots)) or any(slot not in CONFIGS for slot in slots):
        raise ValueError("Invalid transport restore slots")
    archive = backup / "model-transports.tar"
    if not stat.S_ISREG(archive.lstat().st_mode) or digest(archive) != manifest["archives"]["model-transports.tar"]:
        raise ValueError("Transport archive checksum differs")
    extracted = backup / "restored-model-transports"
    if not stat.S_ISDIR(extracted.lstat().st_mode):
        raise ValueError("Use backup --verify-restore before staging transport services")
    files = {}
    for name, expected in proof["files"].items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or ".." in relative.parts or "\\" in name or len(relative.parts) < 3 or relative.parts[0] != "transports" or relative.parts[1] not in slots:
            raise ValueError("Unsafe transport restore path")
        source = extracted
        for index, part in enumerate(relative.parts):
            source = source / part
            mode = source.lstat().st_mode
            if index == len(relative.parts) - 1:
                if not stat.S_ISREG(mode):
                    raise ValueError("Transport restore requires regular files")
            elif not stat.S_ISDIR(mode):
                raise ValueError("Transport restore rejects linked directories")
        if digest(source) != expected:
            raise ValueError("Restored transport file checksum differs")
        files[name] = source
    configs = {}
    original_ports = set()
    for slot in slots:
        config = json.loads(files["transports/" + slot + "/config.json"].read_text(encoding="utf-8-sig"))
        if not isinstance(config, dict) or set(config) - CONFIG_KEYS or config.get("version") != 1:
            raise ValueError("Unsupported restored transport configuration")
        for key in ("gatewayPort", "windowsRelayPort", "dockerRelayPort"):
            if type(config.get(key)) is not int or not 1 <= config[key] <= 65535:
                raise ValueError("Invalid original transport port")
            original_ports.add(config[key])
        configs[slot] = config
    if len(port_starts) != 3 or any(type(value) is not int for value in port_starts):
        raise ValueError("Three explicit isolated port ranges are required")
    ports = [start + index for start in port_starts for index in range(len(slots))]
    if len(ports) != len(set(ports)) or any(not 1 <= value <= 65535 or value in original_ports for value in ports):
        raise ValueError("Restore ports overlap each other or an original live service")
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    for name, source in files.items():
        if name.endswith("/config.json"):
            continue
        target = output.joinpath(*PurePosixPath(name).parts[1:])
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(0o600)
        if digest(target) != proof["files"][name]:
            raise RuntimeError("Staged transport file checksum differs")
    staged = []
    for index, slot in enumerate(slots):
        config = dict(configs[slot])
        directory = output / slot
        directory.mkdir(mode=0o700, exist_ok=True)
        receipts = directory / "receipts"
        receipts.mkdir(mode=0o700, exist_ok=True)
        native = str(receipts)
        if os.name != "nt" and re.match(r"^[A-Za-z]:[\\/]", config["receiptDirectory"]):
            parts = receipts.parts
            if len(parts) < 4 or parts[1] != "mnt" or len(parts[2]) != 1:
                raise ValueError("Stage Windows transports on Windows or its mounted local drive")
            native = str(PureWindowsPath(parts[2].upper() + ":/", *parts[3:]))
        config["receiptDirectory"] = native
        for key, start in zip(("gatewayPort", "windowsRelayPort", "dockerRelayPort"), port_starts):
            config[key] = start + index
        destination = directory / "config.json"
        with destination.open("x", encoding="utf-8") as stream:
            json.dump(config, stream, ensure_ascii=False, indent=2)
        destination.chmod(0o600)
        staged.append({"slot": slot, "config": str(destination), "receiptFiles": sum(name.startswith("transports/" + slot + "/receipts/") for name in files)})
    result = {"accepted": True, "archiveSHA256": manifest["archives"]["model-transports.tar"], "staged": staged, "modelInferenceCalls": 0, "liveServicesChanged": False, "weightsCopied": False}
    (output / "restore-stage-receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    return result
