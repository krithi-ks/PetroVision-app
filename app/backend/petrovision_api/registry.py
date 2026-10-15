"""Model registry: the five evaluated PetroVision models and how to find their checkpoints.

Names in ``results_name`` match the ``Model`` column of results/cv_final_model_comparison.csv.
"""

from __future__ import annotations

import importlib.util
from dataclasses import dataclass
from pathlib import Path

from .config import Settings


@dataclass(frozen=True)
class ModelSpec:
    id: str
    label: str
    results_name: str          # row name in cv_final_model_comparison.csv
    experiment_id: str
    family: str                # unet | deeplab | segformer | mask2former | yolo
    architecture: str
    initialization: str
    description: str
    default_checkpoint: str    # relative to models dir
    requires: tuple            # python modules that must be importable
    input_note: str
    task: str = "semantic"      # semantic | instance
    dataset: str = "LADOS"
    checkpoint_globs: tuple = ()   # extra filename patterns searched under the models folder


MODEL_SPECS: tuple[ModelSpec, ...] = (
    ModelSpec(
        id="unet",
        label="U-Net",
        results_name="U-Net",
        experiment_id="CV-UNET-001",
        family="unet",
        architecture="Custom lightweight U-Net",
        initialization="Trained from scratch (baseline)",
        description="Custom baseline encoder-decoder trained from scratch on LADOS.",
        default_checkpoint="cv_unet_001_best.pt",
        requires=("torch",),
        input_note="256x256 RGB, scaled to [0, 1]",
    ),
    ModelSpec(
        id="deeplab",
        label="DeepLabV3+",
        results_name="DeepLabV3+",
        experiment_id="CV-DEEPLAB-001",
        family="deeplab",
        architecture="DeepLabV3+ with ResNet-50 encoder",
        initialization="ImageNet-pretrained encoder, fine-tuned on LADOS",
        description="CNN with atrous spatial pyramid pooling and a ResNet-50 encoder.",
        default_checkpoint="cv_deeplab_001_best.pt",
        requires=("torch", "segmentation_models_pytorch"),
        input_note="256x256 RGB, scaled to [0, 1]",
    ),
    ModelSpec(
        id="segformer",
        label="SegFormer-B0",
        results_name="SegFormer-B0",
        experiment_id="CV-SEGFORMER-001",
        family="segformer",
        architecture="SegFormer-B0 with MiT-B0 backbone",
        initialization="Pretrained MiT-B0, fine-tuned on LADOS",
        description="Lightweight transformer encoder with an all-MLP decoder.",
        default_checkpoint="cv_segformer_001_best.pt",
        requires=("torch", "transformers"),
        input_note="256x256 RGB, scaled to [0, 1]",
    ),
    ModelSpec(
        id="mask2former",
        label="Mask2Former",
        results_name="Mask2Former",
        experiment_id="CV-MASK2FORMER-001",
        family="mask2former",
        architecture="Mask2Former with Swin-Small backbone",
        initialization="ADE20K-pretrained, fine-tuned on LADOS",
        description="Transformer mask-classification model; semantic map derived from query masks.",
        default_checkpoint="cv_mask2former_001_best.pt",
        requires=("torch", "transformers", "scipy"),
        input_note="256x256 RGB through the Mask2Former image processor",
    ),
    ModelSpec(
        id="yolo",
        label="YOLO11n-Seg",
        results_name="YOLO11n-Seg",
        experiment_id="CV-YOLO-001",
        family="yolo",
        architecture="YOLO11n-Seg instance segmentation",
        initialization="Pretrained YOLO11n-Seg, fine-tuned on LADOS",
        description="Instance-segmentation model; predicted instances are merged into one mask.",
        default_checkpoint="cv_yolo_001_best.pt",
        requires=("torch", "ultralytics"),
        input_note="imgsz 640, conf 0.25, retina masks (as in the evaluation notebook)",
        task="instance",
    ),
    ModelSpec(
        id="yolo26",
        label="YOLO26n-Seg",
        results_name="YOLO26n-Seg",
        experiment_id="CV-YOLO26-DEKERF",
        family="yolo",
        architecture="YOLO26n-Seg instance segmentation",
        initialization="Pretrained YOLO26n-Seg, fine-tuned on De Kerf",
        description="Instance-segmentation model trained on oil instances derived from connected regions of the De Kerf semantic masks.",
        default_checkpoint="cv_yolo26_dekerf_best.pt",
        requires=("torch", "ultralytics"),
        input_note="image size read from the checkpoint's training settings",
        task="instance",
        dataset="De Kerf",
        checkpoint_globs=("cv_yolo26*_best.pt", "*yolo26*best.pt"),
    ),
)

SPEC_BY_ID = {s.id: s for s in MODEL_SPECS}


@dataclass(frozen=True)
class Availability:
    status: str            # available | checkpoint_missing | dependency_missing
    checkpoint_path: Path
    message: str
    missing_modules: tuple = ()


def checkpoint_path(spec: ModelSpec, settings: Settings) -> Path:
    """Explicit override > default filename > pattern search anywhere under the models folder."""
    override = settings.checkpoint_overrides.get(spec.id)
    if override:
        return override
    default = settings.models_dir / spec.default_checkpoint
    if default.is_file() or not settings.models_dir.is_dir():
        return default
    for pattern in (spec.default_checkpoint, *spec.checkpoint_globs):
        for found in sorted(settings.models_dir.rglob(pattern)):
            if found.is_file():
                return found
    return default


def _short(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except ValueError:
        return str(path)


def check_availability(spec: ModelSpec, settings: Settings) -> Availability:
    path = checkpoint_path(spec, settings)
    missing = tuple(m for m in spec.requires if importlib.util.find_spec(m) is None)
    if missing:
        return Availability("dependency_missing", path, "Required component is not installed.", missing)
    if not path.is_file():
        return Availability("checkpoint_missing", path, "Model files are not installed.")
    return Availability("available", path, "Checkpoint found.")
