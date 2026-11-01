# SPDX-License-Identifier: AGPL-3.0-or-later
"""One offline CPU speech execution. Never downloads weights or accepts URLs."""
import argparse
import hashlib
import json
import os
import random
import subprocess
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--ffmpeg", required=True, type=Path)
    args = parser.parse_args()
    os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_DATASETS_OFFLINE="1")
    from local_speech import SpeechRequest, decode_voice_reference
    import numpy as np
    import soundfile as sf
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    raw.pop("version", None)
    request = SpeechRequest.model_validate(raw)
    work = args.input.parent
    torch.set_num_threads(6)
    torch.manual_seed(request.seed)
    random.seed(request.seed)
    np.random.seed(request.seed)
    reference = None
    if request.reference_audio:
        source, reference = work / "reference.bin", work / "reference.wav"
        source.write_bytes(decode_voice_reference(request.reference_audio))
        subprocess.run([str(args.ffmpeg), "-nostdin", "-v", "error", "-y", "-i", str(source), "-t", "21", "-vn", "-ac", "1", "-ar", "24000", str(reference)], check=True, timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        facts = sf.info(reference)
        if not 3 <= facts.duration <= 20:
            raise ValueError("Voice reference must contain 3–20 seconds of authorized speech; trim it before submitting")
    tts = ChatterboxMultilingualTTS.from_local(args.model, "cpu", t3_model="t3_mtl23ls_v2.safetensors")
    with torch.inference_mode():
        samples = tts.generate(request.prompt, language_id=request.language, audio_prompt_path=str(reference) if reference else None, exaggeration=request.expression)
    generated = work / "generated.wav"
    sf.write(generated, samples.squeeze().detach().cpu().numpy(), tts.sr)
    codecs = {"wav": ["-c:a", "pcm_s16le"], "mp3": ["-c:a", "libmp3lame", "-b:a", "192k"], "flac": ["-c:a", "flac"], "opus": ["-c:a", "libopus", "-b:a", "128k"]}
    temporary = work / ("output.part." + request.format)
    subprocess.run([str(args.ffmpeg), "-nostdin", "-v", "error", "-y", "-i", str(generated), "-vn", "-af", "atempo=" + str(request.speed), *codecs[request.format], str(temporary)], check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    probe = args.ffmpeg.with_name("ffprobe.exe" if os.name == "nt" else "ffprobe")
    metadata = json.loads(subprocess.check_output([str(probe), "-v", "error", "-show_entries", "format=duration:stream=codec_type,sample_rate,channels", "-of", "json", str(temporary)], timeout=30))
    duration = float(metadata["format"]["duration"])
    if not 0 < duration <= 600 or not any(stream["codec_type"] == "audio" for stream in metadata["streams"]):
        raise ValueError("Speech output is empty or outside the supported duration")
    output = work / ("output." + request.format)
    os.replace(temporary, output)
    result = {"format": request.format, "duration": duration, "bytes": output.stat().st_size, "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "local_offline": True, "sample_voice": reference is not None}
    temporary_result = work / "result.part.json"
    with temporary_result.open("w", encoding="utf-8") as stream:
        json.dump(result, stream, separators=(",", ":"));stream.flush();os.fsync(stream.fileno())
    os.replace(temporary_result, work / "result.json")


if __name__ == "__main__":
    main()
