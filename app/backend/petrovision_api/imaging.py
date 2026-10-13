"""Image decoding and preprocessing.

``to_model_tensor`` mirrors ``src/vision/lados_dataset.py::LADOSDataset.__getitem__``:
RGB -> bilinear resize to 256x256 -> float32 / 255 -> CHW. No ImageNet normalisation is
applied for U-Net / DeepLabV3+ / SegFormer, exactly as during training and evaluation.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import ImageDecodeError

MODEL_INPUT_SIZE = (256, 256)   # image size used for every PetroVision CV experiment
MAX_INPUT_PIXELS = 64_000_000
MIN_SIDE = 8


def decode_image(data: bytes) -> Image.Image:
    """Decode raw bytes into an RGB PIL image (EXIF-rotated). Raises ImageDecodeError."""
    if not data:
        raise ImageDecodeError("The uploaded file is empty.")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Image.DecompressionBombError:
        raise ImageDecodeError("Image is too large to process safely.") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise ImageDecodeError(
            "Could not decode this file as an image.",
            hint="Use a JPEG, PNG, WebP or BMP image.",
        ) from None

    try:
        image = ImageOps.exif_transpose(image)
    except Exception:  # corrupted EXIF should not block analysis
        pass
    image = image.convert("RGB")

    width, height = image.size
    if min(width, height) < MIN_SIDE:
        raise ImageDecodeError(f"Image is too small ({width}x{height}px).")
    if width * height > MAX_INPUT_PIXELS:
        raise ImageDecodeError(
            f"Image is too large ({width}x{height}px). Maximum is {MAX_INPUT_PIXELS // 1_000_000} megapixels."
        )
    return image


def resize_for_model(image: Image.Image, size=MODEL_INPUT_SIZE) -> Image.Image:
    """Bilinear resize identical to the dataset loader."""
    return image.resize(size, Image.Resampling.BILINEAR)


def to_model_tensor(image: Image.Image, size=MODEL_INPUT_SIZE):
    """PIL RGB -> float32 tensor [1, 3, H, W] in [0, 1]."""
    import torch

    arr = np.asarray(resize_for_model(image, size), dtype=np.float32) / 255.0
    return torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).contiguous()


def mask_size_for(image: Image.Image, max_side: int) -> tuple[int, int]:
    """Output (width, height) of the returned mask: original size, capped to ``max_side``."""
    width, height = image.size
    longest = max(width, height)
    if longest <= max_side:
        return width, height
    scale = max_side / longest
    return max(1, round(width * scale)), max(1, round(height * scale))
