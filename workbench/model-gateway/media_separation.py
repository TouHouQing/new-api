# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline Demucs computation. Native Yingce tasks own execution and adoption."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess

CHECKPOINT_SHA256 = "8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4"
MAX_SOURCE_BYTES = 32 * 1024 * 1024
MAX_SECONDS = 600
ROLES = {"vocals": "人声", "instrumental": "伴奏", "drums": "鼓点", "bass": "贝斯", "other": "其他乐器"}


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_source(value):
    import re
    header, separator, encoded = value.partition(",")
    if separator != "," or not re.fullmatch(r"data:audio/(?:wav|x-wav|mpeg|mp3|flac|ogg|opus|webm|aac|mp4|x-m4a);base64", header):
        raise ValueError("An uploaded owned audio source is required; remote URLs are not accepted")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Invalid source audio encoding") from error
    if not 32 <= len(data) <= MAX_SOURCE_BYTES:
        raise ValueError("Source audio must be at most 32 MiB")
    return data


def result_roles(mode):
    if mode == "pair":
        return ["vocals", "instrumental"]
    if mode == "all":
        return list(ROLES)
    raise ValueError("Choose vocals and accompaniment, or all five stems")


def source_info(ffmpeg, source):
    probe = ffmpeg.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    info = json.loads(subprocess.check_output([str(probe), "-v", "error", "-select_streams", "a:0", "-show_entries", "format=duration:stream=sample_rate,channels", "-of", "json", str(source)], timeout=30))
    duration = float(info.get("format", {}).get("duration", 0))
    streams = info.get("streams", [])
    if not math.isfinite(duration) or not .1 <= duration <= MAX_SECONDS or not streams or not 1 <= int(streams[0].get("channels", 0)) <= 8:
        raise ValueError("Choose a valid audio source between 0.1 seconds and 10 minutes")
    return duration


def required_disk_bytes(seconds, count):
    # Include decoded PCM, temporary output replacement, and every native stem.
    return 512 * 1024 * 1024 + math.ceil(seconds * 44100 * 2 * (4 + 2 * (count + 1)))


def separate(payload, checkpoint, ffmpeg, directory):
    if not checkpoint.is_file() or file_sha256(checkpoint) != CHECKPOINT_SHA256:
        raise ValueError("The installed Demucs checkpoint does not match its pinned checksum")
    roles = result_roles(payload["stems"])
    source = directory / "source.bin"
    source.write_bytes(decode_source(payload["reference_audio"]))
    seconds = source_info(ffmpeg, source)
    if shutil.disk_usage(directory).free < required_disk_bytes(seconds, len(roles)):
        raise OSError("Insufficient free storage for all selected stems; no partial result was accepted")
    import numpy as np
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.states import load_model

    torch.set_num_threads(min(6, os.cpu_count() or 1))
    # Demucs checkpoints contain their model class. Only the exact pinned,
    # checksum-verified installed file is deserialized; never an uploaded model.
    # Pass the package explicitly because current Torch defaults to weights_only.
    model = load_model(torch.load(checkpoint, map_location="cpu", weights_only=False)).cpu().eval()
    if set(model.sources) != {"vocals", "drums", "bass", "other"} or model.samplerate != 44100 or model.audio_channels != 2:
        raise ValueError("The selected separator does not expose the expected four source tracks")
    pcm = subprocess.check_output([str(ffmpeg), "-v", "error", "-nostdin", "-i", str(source), "-map", "0:a:0", "-vn", "-t", str(MAX_SECONDS + 1), "-ac", "2", "-ar", "44100", "-f", "f32le", "pipe:1"], timeout=90)
    audio = np.frombuffer(pcm, dtype="<f4")
    if len(audio) % 2 or not .1 <= len(audio) / 88200 <= MAX_SECONDS or not np.isfinite(audio).all():
        raise ValueError("The decoded source duration or samples are invalid")
    waveform = torch.from_numpy(audio.reshape(-1, 2).T.copy())
    reference = waveform.mean(0)
    mean, std = reference.mean(), reference.std().clamp_min(1e-5)
    with torch.inference_mode():
        separated = apply_model(model, ((waveform - mean) / std)[None], device="cpu", shifts=0, split=True, overlap=.25, progress=False)[0] * std
    # A shared DC component is divided over the four stems so their sum retains
    # the original offset instead of adding the full offset four times.
    separated = separated + mean / len(model.sources)
    tracks = {name: separated[index] for index, name in enumerate(model.sources)}
    tracks["instrumental"] = sum(tracks[name] for name in model.sources if name != "vocals")
    if not all(torch.isfinite(tracks[role]).all() for role in roles):
        raise ValueError("The separator returned invalid samples")
    peak = max(float(tracks[role].abs().max()) for role in roles)
    gain = min(1., .99 / peak) if peak else 1.
    outputs = []
    for role in roles:
        samples = (tracks[role] * gain).T.contiguous().numpy()
        temporary = directory / (role + ".part.wav")
        output = directory / (role + ".wav")
        sf.write(temporary, samples, 44100, subtype="PCM_16", format="WAV")
        os.replace(temporary, output)
        outputs.append({"role": role, "name": ROLES[role], "filename": output.name, "mime_type": "audio/wav", "duration": samples.shape[0] / 44100, "bytes": output.stat().st_size, "sha256": file_sha256(output)})
    result = {"version": 1, "model": "htdemucs", "checkpoint_sha256": CHECKPOINT_SHA256, "source_sha256": file_sha256(source), "source_duration": waveform.shape[1] / 44100, "sample_rate": 44100, "channels": 2, "shared_gain": gain, "stems": payload["stems"], "outputs": outputs}
    temporary = directory / "result.part.json"
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, directory / "result.json")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    args = parser.parse_args()
    separate(json.loads(args.input.read_text(encoding="utf-8")), args.model, args.ffmpeg, args.input.parent)
