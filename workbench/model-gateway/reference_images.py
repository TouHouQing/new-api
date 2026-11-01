# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded pixel inputs; the transport never fetches caller-supplied URLs."""
import base64
import binascii
import hashlib
import io
import warnings
from dataclasses import dataclass

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000


@dataclass(frozen=True)
class ReferenceImage:
    png: bytes
    digest: str

    def base64(self) -> str:
        return base64.b64encode(self.png).decode("ascii")


def decode_reference(value: str) -> ReferenceImage:
    header, separator, encoded = value.partition(",")
    if not separator or header not in {"data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64"}:
        raise HTTPException(400, "Reference must be an inline PNG, JPEG or WebP image")
    if len(encoded) > (MAX_IMAGE_BYTES + 2) // 3 * 4:
        raise HTTPException(413, "Reference image exceeds 8 MiB")
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise ValueError("invalid size")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"} or source.width * source.height > MAX_IMAGE_PIXELS or getattr(source, "n_frames", 1) != 1:
                    raise ValueError("unsupported image")
                source.load()
                pixels = ImageOps.exif_transpose(source).convert("RGBA")
                # Preserve proportions and the original resource; only the model
                # input is bounded to avoid exhausting shared GPU memory.
                pixels.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                background = Image.new("RGB", pixels.size, "white")
                background.paste(pixels, mask=pixels.getchannel("A"))
                stream = io.BytesIO()
                background.save(stream, format="PNG")
                png = stream.getvalue()
    except (ValueError, OSError, binascii.Error, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise HTTPException(400, "Reference is invalid, animated or exceeds 16 megapixels") from error
    return ReferenceImage(png, hashlib.sha256(png).hexdigest())
