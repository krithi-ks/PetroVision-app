"""Mask post-processing: image-space measurements, contours and PNG encoding.

All quantities are computed from the *predicted binary mask only*. They describe visible,
image-space extent. They are NOT physical area, concentration, thickness or volume.
"""

from __future__ import annotations

import base64
import io

import cv2
import numpy as np
from PIL import Image

OVERLAY_RGBA = (255, 106, 0, 150)   # orange, semi-transparent
MAX_CONTOURS_RETURNED = 60


def measure_mask(mask: np.ndarray) -> dict:
    """Image-space measurements of a boolean mask (H x W)."""
    mask = np.asarray(mask, dtype=bool)
    height, width = mask.shape
    total = int(height * width)
    pixels = int(mask.sum())

    out = {
        "has_petroleum_like_region": pixels > 0,
        "petroleum_pixels": pixels,
        "total_pixels": total,
        "coverage_percent": round(100.0 * pixels / total, 4) if total else 0.0,
        "bounding_box": None,
        "centroid": None,
        "perimeter_px": 0.0,
        "region_count": 0,
        "largest_region_pixels": 0,
        "normalized": {"bounding_box": None, "centroid": None},
        "units": f"pixels of the returned {width}x{height} mask",
    }
    if pixels == 0:
        return out

    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    cx, cy = float(xs.mean()), float(ys.mean())
    out["bounding_box"] = {"x": x0, "y": y0, "width": x1 - x0 + 1, "height": y1 - y0 + 1}
    out["centroid"] = {"x": round(cx, 2), "y": round(cy, 2)}
    out["normalized"] = {
        "bounding_box": {
            "x": round(x0 / width, 5), "y": round(y0 / height, 5),
            "width": round((x1 - x0 + 1) / width, 5), "height": round((y1 - y0 + 1) / height, 5),
        },
        "centroid": {"x": round(cx / width, 5), "y": round(cy / height, 5)},
    }

    m8 = mask.astype(np.uint8)
    # RETR_CCOMP -> outer boundaries and hole boundaries; perimeter = total boundary length.
    contours, _ = cv2.findContours(m8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out["perimeter_px"] = round(float(sum(cv2.arcLength(c, True) for c in contours)), 2)

    n_labels, _labels, stats, _ = cv2.connectedComponentsWithStats(m8, connectivity=8)
    if n_labels > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        out["region_count"] = int(n_labels - 1)
        out["largest_region_pixels"] = int(areas.max())
    return out


def extract_contours(mask: np.ndarray) -> list[list[list[float]]]:
    """Simplified outer contours as normalised [x, y] polygons (largest regions first)."""
    mask = np.asarray(mask, dtype=bool)
    if not mask.any():
        return []
    height, width = mask.shape
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:MAX_CONTOURS_RETURNED]
    polygons = []
    for contour in contours:
        approx = cv2.approxPolyDP(contour, 1.2, True).reshape(-1, 2)
        if len(approx) < 3:
            continue
        polygons.append([[round(x / width, 4), round(y / height, 4)] for x, y in approx.tolist()])
    return polygons


def _png_data_url(array: np.ndarray, mode: str) -> str:
    buffer = io.BytesIO()
    Image.fromarray(array, mode=mode).save(buffer, format="PNG", compress_level=3)
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def mask_to_png(mask: np.ndarray) -> str:
    """Binary mask as 8-bit grayscale PNG (255 = predicted petroleum-like region)."""
    return _png_data_url((np.asarray(mask, dtype=bool) * 255).astype(np.uint8), "L")


def mask_to_overlay_png(mask: np.ndarray, rgba=OVERLAY_RGBA) -> str:
    """Transparent RGBA PNG with the predicted region tinted; to be drawn over the original."""
    mask = np.asarray(mask, dtype=bool)
    rgba_arr = np.zeros(mask.shape + (4,), dtype=np.uint8)
    rgba_arr[mask] = rgba
    return _png_data_url(rgba_arr, "RGBA")


def labels_to_png(label_map: np.ndarray) -> str:
    """8-bit label image: 0 = background, k = instance/region k (1-based)."""
    return _png_data_url(np.asarray(label_map, dtype=np.uint8), "L")


MAX_REGIONS = 24
MIN_REGION_FRACTION = 0.0002     # ignore specks smaller than 0.02 % of the image


def regions_from_mask(mask: np.ndarray) -> list[np.ndarray]:
    """Connected components of a semantic mask, largest first. These are *regions*, not model instances."""
    mask = np.asarray(mask, dtype=bool)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if n <= 1:
        return []
    min_area = max(20, int(MIN_REGION_FRACTION * mask.size))
    order = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])
    return [labels == i for i in order if stats[i, cv2.CC_STAT_AREA] >= min_area][:MAX_REGIONS]


def build_instance_record(index: int, mask: np.ndarray, *, kind: str, confidence, class_name, with_contour: bool) -> dict:
    """Per-instance measurements, all derived from that instance's own predicted mask."""
    m = measure_mask(mask)
    record = {
        "index": index,
        "id": f"{index:02d}",
        "kind": kind,                       # "instance" (model output) | "region" (connected component of a semantic mask)
        "class_name": class_name,
        "confidence": None if confidence is None else round(float(confidence), 4),
        "area_px": m["petroleum_pixels"],
        "coverage_percent": m["coverage_percent"],
        "perimeter_px": m["perimeter_px"],
        "centroid": m["centroid"],
        "bounding_box": m["bounding_box"],
        "normalized": m["normalized"],
    }
    if with_contour:
        polys = extract_contours(mask)
        record["contour"] = polys[0] if polys else []      # largest outer boundary, normalised [x, y]
    return record
