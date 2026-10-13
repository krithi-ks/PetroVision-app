"""Read the project's saved experiment results from ``results/``.

Nothing is hard-coded here: every number is parsed from the existing CSV/JSON files and the
"highest / lowest in this evaluation" observations are computed from those rows.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from .config import Settings
from .errors import ResultsUnavailableError
from .dekerf import load_dekerf
from .registry import MODEL_SPECS, SPEC_BY_ID

COMPARISON_FILE = "cv_final_model_comparison.csv"
BENCHMARK_FILE = "cv_inference_benchmark.json"
SUMMARY_FILE = "cv_master_summary.json"

QUALITY_METRICS = ("iou", "dice", "precision", "recall", "accuracy")

# CSV header -> API field
_FIELD_MAP = {
    "Model": "model_name",
    "IoU": "iou",
    "Dice": "dice",
    "Precision": "precision",
    "Recall": "recall",
    "Accuracy": "accuracy",
    "Parameters_M": "parameters_m",
    "Checkpoint_MB": "checkpoint_mb",
    "Mean_ms_per_image": "mean_ms_per_image",
    "Images_per_second": "images_per_second",
}

_EXPERIMENT_DIRS = {
    "unet": "cv_unet_001",
    "deeplab": "cv_deeplab_001",
    "segformer": "cv_segformer_001",
    "mask2former": "cv_mask2former_001",
    "yolo": "cv_yolo_001",
}


def _read_text(path: Path) -> str:
    raw = path.read_bytes()
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    return raw.decode("utf-8-sig")


class ResultsRepository:
    def __init__(self, settings: Settings):
        self.dir = settings.results_dir
        self.root = settings.project_root

    def _require(self, name: str) -> Path:
        path = self.dir / name
        if not path.is_file():
            raise ResultsUnavailableError(
                f"Result file not found: {path}",
                hint="Set PETROVISION_RESULTS_DIR to the folder that contains the experiment results.",
            )
        return path

    def _json(self, name: str) -> dict:
        return json.loads(_read_text(self._require(name)))

    # ------------------------------------------------------------------ comparison table
    def comparison(self) -> dict:
        path = self._require(COMPARISON_FILE)
        rows = []
        by_results_name = {s.results_name: s for s in MODEL_SPECS}
        for raw in csv.DictReader(_read_text(path).splitlines()):
            row = {}
            for header, field in _FIELD_MAP.items():
                value = raw.get(header)
                if value is None or value == "":
                    row[field] = None
                elif field == "model_name":
                    row[field] = value
                else:
                    row[field] = float(value)
            spec = by_results_name.get(row.get("model_name"))
            row["model_id"] = spec.id if spec else None
            row["experiment_id"] = spec.experiment_id if spec else None
            rows.append(row)

        return {
            "source": f"results/{COMPARISON_FILE}",
            "rows": rows,
            "observations": self._observations(rows),
        }

    @staticmethod
    def _observations(rows: list) -> dict:
        """Factual 'highest/lowest measured value' statements derived from the rows."""
        def extreme(field, fn):
            valid = [r for r in rows if r.get(field) is not None]
            if not valid:
                return None
            row = fn(valid, key=lambda r: r[field])
            return {"model_name": row["model_name"], "model_id": row["model_id"], "value": row[field]}

        obs = {metric: extreme(metric, max) for metric in QUALITY_METRICS}
        obs["lowest_latency"] = extreme("mean_ms_per_image", min)
        obs["highest_throughput"] = extreme("images_per_second", max)
        obs["fewest_parameters"] = extreme("parameters_m", min)
        obs["smallest_checkpoint"] = extreme("checkpoint_mb", min)
        return obs

    # ------------------------------------------------------------------ benchmark & summary
    def benchmark(self) -> dict:
        data = self._json(BENCHMARK_FILE)
        by_results_name = {s.results_name: s for s in MODEL_SPECS}
        models = []
        for name, values in data.get("models", {}).items():
            spec = by_results_name.get(name)
            models.append({"model_name": name, "model_id": spec.id if spec else None, **values})
        return {
            "source": f"results/{BENCHMARK_FILE}",
            "hardware": data.get("hardware"),
            "input_size": data.get("input_size"),
            "batch_size": data.get("batch_size"),
            "warmup_images": data.get("warmup_images"),
            "timed_images": data.get("timed_images"),
            "timing_scope": data.get("timing_scope"),
            "models": models,
        }

    def summary(self) -> dict:
        data = self._json(SUMMARY_FILE)
        return {
            "source": f"results/{SUMMARY_FILE}",
            "methodology": data.get("methodology", {}),
            "limitations": data.get("limitations", []),
            "models": {
                name: {
                    "experiment_id": m.get("experiment_id"),
                    "architecture": m.get("architecture"),
                    "task": m.get("task"),
                }
                for name, m in data.get("models", {}).items()
            },
        }

    # ------------------------------------------------------------------ De Kerf (YOLO26) experiment
    def dekerf(self) -> dict:
        return load_dekerf(self.dir, self.root)

    # ------------------------------------------------------------------ training history
    def history(self, model_id: str) -> dict:
        folder = _EXPERIMENT_DIRS.get(model_id)
        if folder is None:
            raise ResultsUnavailableError(f"No experiment folder is registered for '{model_id}'.")

        if model_id == "yolo":
            path = self._require(f"{folder}/results.csv")
            rows = list(csv.DictReader(_read_text(path).splitlines()))
            return {
                "source": f"results/{folder}/results.csv",
                "model_id": model_id,
                "loss_name": "YOLO segmentation loss (Ultralytics)",
                "epochs": [int(float(r["epoch"])) for r in rows],
                "train_loss": [float(r["train/seg_loss"]) for r in rows],
                "validation_loss": [float(r["val/seg_loss"]) for r in rows],
                "best_epoch": None,
            }

        data = self._json(f"{folder}/training_history.json")
        train = data.get("train_loss", [])
        val = data.get("validation_loss", data.get("val_loss", []))
        loss_name = "Mask2Former set-prediction loss" if model_id == "mask2former" else "BCE + Dice loss"
        best_epoch = data.get("best_epoch")
        if best_epoch is None and val:
            best_epoch = val.index(min(val)) + 1
        return {
            "source": f"results/{folder}/training_history.json",
            "model_id": model_id,
            "loss_name": loss_name,
            "epochs": list(range(1, len(train) + 1)),
            "train_loss": train,
            "validation_loss": val,
            "best_epoch": best_epoch,
        }

    def spec_for_name(self, name: str):
        for spec in SPEC_BY_ID.values():
            if spec.results_name == name:
                return spec
        return None
