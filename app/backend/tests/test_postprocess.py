"""Geometry of the measurement code, checked on tiny hand-made masks (math test only)."""
import base64
import io

import numpy as np
from PIL import Image

from petrovision_api.postprocess import extract_contours, mask_to_overlay_png, mask_to_png, measure_mask


def test_empty_mask():
    m = measure_mask(np.zeros((50, 80), dtype=bool))
    assert m["petroleum_pixels"] == 0 and m["coverage_percent"] == 0
    assert m["bounding_box"] is None and m["centroid"] is None and m["region_count"] == 0
    assert m["has_petroleum_like_region"] is False


def test_rectangle_measurements():
    mask = np.zeros((100, 200), dtype=bool)
    mask[20:40, 50:100] = True           # 20 rows x 50 cols
    m = measure_mask(mask)
    assert m["petroleum_pixels"] == 1000
    assert m["total_pixels"] == 20000
    assert m["coverage_percent"] == 5.0
    assert m["bounding_box"] == {"x": 50, "y": 20, "width": 50, "height": 20}
    assert m["centroid"] == {"x": 74.5, "y": 29.5}
    assert m["region_count"] == 1 and m["largest_region_pixels"] == 1000
    # contour length of a pixel-rectangle through pixel centres = 2*(49+19)
    assert abs(m["perimeter_px"] - 136.0) < 1e-6
    assert m["normalized"]["bounding_box"]["width"] == 0.25


def test_two_regions_and_full_mask():
    mask = np.zeros((60, 60), dtype=bool)
    mask[5:15, 5:15] = True
    mask[30:50, 30:40] = True
    m = measure_mask(mask)
    assert m["region_count"] == 2 and m["largest_region_pixels"] == 200
    assert measure_mask(np.ones((10, 10), dtype=bool))["coverage_percent"] == 100.0


def test_png_encoders_roundtrip():
    mask = np.zeros((16, 24), dtype=bool)
    mask[4:8, 6:12] = True
    raw = base64.b64decode(mask_to_png(mask).split(",", 1)[1])
    gray = np.array(Image.open(io.BytesIO(raw)))
    assert gray.shape == (16, 24) and set(np.unique(gray)) == {0, 255} and (gray == 255).sum() == mask.sum()
    rgba = np.array(Image.open(io.BytesIO(base64.b64decode(mask_to_overlay_png(mask).split(",", 1)[1]))))
    assert rgba.shape == (16, 24, 4) and (rgba[..., 3] > 0).sum() == mask.sum()


def test_contours_normalised():
    mask = np.zeros((40, 40), dtype=bool)
    mask[10:30, 10:30] = True
    polys = extract_contours(mask)
    assert len(polys) == 1 and all(0 <= x <= 1 and 0 <= y <= 1 for x, y in polys[0])
