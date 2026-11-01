# SPDX-License-Identifier: AGPL-3.0-or-later
"""Offline CPU inference subprocess; stdout contains the final JSON only."""
import argparse
import json
import os
import math


def recognition_payload(segments, language):
    values, words = [], []
    incomplete = False
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        if not (math.isfinite(segment.start) and math.isfinite(segment.end) and 0 <= segment.start < segment.end <= 86400):
            raise ValueError("Invalid recognition segment timing")
        values.append({"start": segment.start, "end": segment.end, "text": text})
        incomplete |= segment.words is None
        for word in segment.words or []:
            text = word.word.strip()
            if not text:
                continue
            if not (math.isfinite(word.start) and math.isfinite(word.end) and 0 <= word.start <= word.end <= 86400):
                raise ValueError("Invalid recognition word timing")
            if word.end <= word.start or round(word.end * 1000) <= round(word.start * 1000):
                # Punctuation may have no acoustic interval. Never invent one.
                incomplete |= any(character.isalnum() for character in text)
                continue
            entry = {"start": word.start, "end": word.end, "text": text}
            if word.probability is not None:
                if not math.isfinite(word.probability) or not 0 <= word.probability <= 1:
                    raise ValueError("Invalid recognition confidence")
                entry["confidence"] = word.probability
            words.append(entry)
    result = {"segments": values, "language": language}
    if words:
        result["words"] = words
    if incomplete:
        result["word_timing_incomplete"] = True
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--language", default="")
    args = parser.parse_args()
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from faster_whisper import WhisperModel
    model = WhisperModel(args.model, device="cpu", compute_type="int8", cpu_threads=6, num_workers=1, local_files_only=True)
    segments, info = model.transcribe(args.input, language=args.language or None, beam_size=5, vad_filter=True, word_timestamps=True)
    print(json.dumps(recognition_payload(segments, info.language), ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
