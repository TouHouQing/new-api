# SPDX-License-Identifier: AGPL-3.0-or-later
"""ACE-Step compute graph; native Yingce tasks own approvals and assets."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class MusicOptions(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    mode: Literal["instrumental", "song"] = "instrumental"
    seconds: int = Field(default=30, ge=10, le=30)
    bpm: int = Field(default=90, ge=40, le=240)
    language: Literal["zh", "en", "ja", "ko", "yue"] = "zh"
    lyrics: str = Field(default="", max_length=3000)

    @model_validator(mode="after")
    def lyrics_match_mode(self):
        if self.mode == "song" and not self.lyrics.strip():
            raise ValueError("A song requires the actual lyrics")
        if self.mode == "instrumental" and self.lyrics.strip():
            raise ValueError("Instrumental music cannot contain lyrics")
        return self


MUSIC_WEIGHTS = {
    "UNETLoader": {"unet_name": "acestep_v1.5_turbo.safetensors"},
    "DualCLIPLoader": {"clip_name1": "qwen_0.6b_ace15.safetensors", "clip_name2": "qwen_1.7b_ace15.safetensors"},
    "VAELoader": {"vae_name": "ace_1.5_vae.safetensors"},
}
MUSIC_NODES = (*MUSIC_WEIGHTS, "TextEncodeAceStepAudio1.5", "ConditioningZeroOut", "EmptyAceStep1.5LatentAudio", "ModelSamplingAuraFlow", "KSampler", "VAEDecodeAudio", "SaveAudio")


def music_workflow(prompt: str, options: MusicOptions, seed: int, digest: str) -> dict:
    tags = prompt if options.mode == "song" else "instrumental, no vocals, " + prompt
    return {
        "1": {"class_type": "UNETLoader", "inputs": {**MUSIC_WEIGHTS["UNETLoader"], "weight_dtype": "default"}},
        "2": {"class_type": "DualCLIPLoader", "inputs": {**MUSIC_WEIGHTS["DualCLIPLoader"], "type": "ace", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": MUSIC_WEIGHTS["VAELoader"].copy()},
        "4": {"class_type": "TextEncodeAceStepAudio1.5", "inputs": {
            "clip": ["2", 0], "tags": tags, "lyrics": options.lyrics if options.mode == "song" else "[Instrumental]",
            "seed": seed, "bpm": options.bpm, "duration": options.seconds, "timesignature": "4", "language": options.language,
            "keyscale": "C major", "generate_audio_codes": True, "cfg_scale": 2.0, "temperature": .85, "top_p": .9, "top_k": 0, "min_p": 0.0}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptyAceStep1.5LatentAudio", "inputs": {"seconds": options.seconds, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["7", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["6", 0], "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecodeAudio", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveAudio", "inputs": {"audio": ["9", 0], "filename_prefix": "yingce/" + digest[:24]}},
    }


async def music_inventory(transport) -> dict:
    missing = []
    for name in MUSIC_NODES:
        try:
            result = await transport.comfy("GET", "/object_info/" + name)
            node = result[name]
            for field, weight in MUSIC_WEIGHTS.get(name, {}).items():
                if weight not in node["input"]["required"][field][0]:
                    missing.append(weight)
        except (KeyError, TypeError, ValueError):
            missing.append("node:" + name)
    return {"model": "audio", "name": "ACE-Step 1.5 Turbo", "model_name": "acestep-1.5-turbo", "available": not missing,
            "missing_weights": missing, "max_references": 0, "streaming": False, "tools": False, "audio": True,
            "operations": ["instrumental", "song"], "min_seconds": 10, "max_seconds": 30, "formats": ["flac"]}
