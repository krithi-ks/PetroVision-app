"""Saved results of the De Kerf YOLO26n-Seg instance-segmentation experiment.

Nothing is typed in here: every number is parsed from files the experiment already produced.

Sources, in order of preference:
  1. ``results/cv_yolo26*/test_metrics_native.json``   (same format as the YOLO11 experiment, if present)
  2. the saved cell outputs of ``notebooks/computer-vision/*YOLO26*DeKerf*.ipynb``  (test evaluation printout)
Training curves and settings come from ``results/cv_yolo26*/**/results.csv`` and ``args.yaml``.
"""

from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path

log = logging.getLogger("petrovision")

METRIC_KEYS = (
    "box_precision", "box_recall", "box_mAP50", "box_mAP50_95",
    "mask_precision", "mask_recall", "mask_mAP50", "mask_mAP50_95",
)
_PRINTED = {
    "Box Precision": "box_precision", "Box Recall": "box_recall", "Box mAP50": "box_mAP50", "Box mAP50-95": "box_mAP50_95",
    "Mask Precision": "mask_precision", "Mask Recall": "mask_recall", "Mask mAP50": "mask_mAP50", "Mask mAP50-95": "mask_mAP50_95",
}


def _outputs_text(cell: dict) -> str:
    parts = []
    for o in cell.get("outputs", []):
        if o.get("output_type") == "stream":
            parts.append("".join(o.get("text", [])))
        else:
            parts.append("".join(o.get("data", {}).get("text/plain", [])))
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", "\n".join(parts))      # strip terminal colour codes


def _from_notebook(path: Path) -> dict | None:
    try:
        nb = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    metrics, extra = {}, {}
    for cell in nb.get("cells", []):
        text = _outputs_text(cell)
        if not text:
            continue
        for label, key in _PRINTED.items():
            m = re.search(rf"{re.escape(label)}:\s*([0-9.]+)", text)
            if m and key not in metrics:
                metrics[key] = float(m.group(1))
        m = re.search(r"Scanning .*?(\d+) images, (\d+) backgrounds", text)
        if m:
            extra["test_images"], extra["test_background_images"] = int(m.group(1)), int(m.group(2))
        m = re.search(r"^\s*all\s+(\d+)\s+(\d+)\s", text, re.M)
        if m:
            extra["test_images"], extra["test_instances"] = int(m.group(1)), int(m.group(2))
        m = re.search(r"Speed:\s*([\d.]+)ms preprocess,\s*([\d.]+)ms inference,\s*[\d.]+ms loss,\s*([\d.]+)ms postprocess", text)
        if m:
            extra["preprocess_ms"], extra["inference_ms"], extra["postprocess_ms"] = (float(x) for x in m.groups())
        m = re.search(r"summary \(fused\):.*?([\d,]+) parameters", text)
        if m:
            extra["parameters_fused"] = int(m.group(1).replace(",", ""))
        m = re.search(r"CUDA:0 \(([^,)]+)", text)
        if m and "hardware" not in extra:
            extra["hardware"] = m.group(1).strip()
    if len(metrics) < len(METRIC_KEYS):
        return None
    return {"metrics": metrics, **extra, "source": "Saved test-split evaluation (experiment notebook output)"}


def _from_json(path: Path) -> dict | None:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
        metrics = {k: float(d[k]) for k in METRIC_KEYS}
    except (OSError, ValueError, KeyError):
        return None
    extra = {k: d[k] for k in ("test_images", "test_instances", "preprocess_ms", "inference_ms", "postprocess_ms") if k in d}
    if "preprocess_ms_per_image" in d:
        extra.update(preprocess_ms=d["preprocess_ms_per_image"], inference_ms=d["inference_ms_per_image"], postprocess_ms=d["postprocess_ms_per_image"])
    return {"metrics": metrics, **extra, "source": "Saved test metrics file"}


def _read_args(path: Path) -> dict:
    out = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^(epochs|imgsz|batch|optimizer|model|patience|seed|lr0):\s*(\S+)", line)
            if m:
                out[m.group(1)] = m.group(2)
    except OSError:
        pass
    return out


def _read_history(path: Path) -> dict | None:
    try:
        rows = list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))
        cols = {k.strip(): k for k in rows[0].keys()}
        pick = lambda name: [float(r[cols[name]]) for r in rows]          # noqa: E731
        return {
            "epochs": [int(float(r[cols["epoch"]])) for r in rows],
            "train_seg_loss": pick("train/seg_loss"),
            "val_seg_loss": pick("val/seg_loss"),
            "mask_mAP50": pick("metrics/mAP50(M)"),
            "mask_mAP50_95": pick("metrics/mAP50-95(M)"),
        }
    except (OSError, IndexError, KeyError, ValueError):
        return None


def load_dekerf(results_dir: Path, project_root: Path) -> dict:
    folders = sorted(p for p in results_dir.glob("cv_yolo26*") if p.is_dir()) if results_dir.is_dir() else []
    parsed = None
    for folder in folders:
        parsed = _from_json(folder / "test_metrics_native.json") if (folder / "test_metrics_native.json").is_file() else None
        if parsed:
            break
    if parsed is None:
        for nb in sorted((project_root / "notebooks").rglob("*YOLO26*DeKerf*.ipynb")):
            parsed = _from_notebook(nb)
            if parsed:
                break
    if parsed is None:
        return {"available": False}

    args, history = {}, None
    for folder in folders:
        for a in folder.rglob("args.yaml"):
            args = _read_args(a)
            break
        for r in folder.rglob("results.csv"):
            history = _read_history(r)
            break

    return {
        "available": True,
        "model_name": "YOLO26n-Seg",
        "experiment_id": "CV-YOLO26-DEKERF",
        "dataset": "De Kerf UAV RGB oil-spill dataset",
        "task": "Instance segmentation",
        "annotation": "Oil instances derived from connected regions of the semantic oil masks (not human-annotated instances).",
        "split": "test",
        "metrics": parsed["metrics"],
        "test": {k: parsed[k] for k in ("test_images", "test_instances", "test_background_images") if k in parsed},
        "speed": {k: parsed[k] for k in ("preprocess_ms", "inference_ms", "postprocess_ms", "hardware") if k in parsed},
        "parameters_fused": parsed.get("parameters_fused"),
        "training": {
            "epochs": int(args["epochs"]) if "epochs" in args else None,
            "image_size": int(args["imgsz"]) if "imgsz" in args else None,
            "batch_size": int(args["batch"]) if "batch" in args else None,
            "initialization": args.get("model"),
            "optimizer": args.get("optimizer"),
        },
        "history": history,
        "source": parsed["source"],
    }
