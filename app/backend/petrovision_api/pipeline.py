"""Run a loaded model on an image and assemble the API payload."""

from __future__ import annotations

import time

from PIL import Image

from .imaging import mask_size_for
from .inference.predictors import BasePredictor
import numpy as np

from .postprocess import (build_instance_record, extract_contours, labels_to_png, mask_to_overlay_png, mask_to_png,
                          measure_mask, regions_from_mask)

SCOPE_NOTES = (
    "Segments visible petroleum-like regions (Oil + Emulsion + Sheen merged into one class) in RGB imagery.",
    "It does not identify petroleum type (petrol, diesel, ...), concentration, thickness or volume.",
    "Coverage and all other measurements are image-space values computed from the predicted mask.",
    "No ground truth exists for this image, so no IoU / Dice / precision / recall is reported.",
)


def analyze_image(
    predictor: BasePredictor,
    image: Image.Image,
    *,
    max_side: int,
    filename: str | None = None,
    include_mask_png: bool = True,
    include_contours: bool = True,
    include_overlay: bool = True,
) -> dict:
    """Real inference + measurements. ``timing.inference_ms`` covers preprocessing, the model
    forward pass and mask post-processing (device synchronised); PNG encoding is excluded."""
    t_start = time.perf_counter()
    out_size = mask_size_for(image, max_side)

    prediction = predictor.predict(image, out_size)
    mask = prediction.mask
    predictor._sync()
    inference_ms = (time.perf_counter() - t_start) * 1000.0

    measurements = measure_mask(mask)

    # ---- instances (model output) or regions (connected components of a semantic mask)
    height, width = mask.shape
    labels = np.zeros((height, width), dtype=np.uint8)
    records = []
    if prediction.instances is not None:
        for i, inst in enumerate(prediction.instances, start=1):
            records.append(build_instance_record(i, inst.mask, kind="instance", confidence=inst.confidence,
                                                 class_name=inst.class_name, with_contour=include_contours))
        for i, inst in reversed(list(enumerate(prediction.instances, start=1))):   # highest confidence painted last
            labels[inst.mask] = min(i, 255)
    else:
        for i, region in enumerate(regions_from_mask(mask), start=1):
            records.append(build_instance_record(i, region, kind="region", confidence=None,
                                                 class_name="petroleum-like", with_contour=include_contours))
            labels[region] = min(i, 255)

    payload = {
        "model": {
            "id": predictor.spec.id,
            "label": predictor.spec.label,
            "task": predictor.spec.task,
            "dataset": predictor.spec.dataset,
            "architecture": predictor.spec.architecture,
            "experiment_id": predictor.spec.experiment_id,
        },
        "image": {"filename": filename, "width": image.size[0], "height": image.size[1]},
        "mask": {"width": out_size[0], "height": out_size[1], "labels_png": labels_to_png(labels)},
        "measurements": measurements,
        "instances": records,
        "instance_count": len(records),
        "notes": list(SCOPE_NOTES),
    }
    if include_overlay:
        payload["mask"]["overlay_png"] = mask_to_overlay_png(mask)
    if include_mask_png:
        payload["mask"]["png"] = mask_to_png(mask)
    if include_contours:
        payload["contours"] = extract_contours(mask)

    payload["timing"] = {
        "inference_ms": round(inference_ms, 2),
        "total_ms": round((time.perf_counter() - t_start) * 1000.0, 2),
    }
    return payload
