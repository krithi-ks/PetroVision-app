"""One predictor class per evaluated architecture.

Every predictor exposes::

    load()                                  -> build the network and load the real checkpoint
    predict_mask(image, (out_w, out_h))     -> boolean ndarray [out_h, out_w]; True = predicted
                                               petroleum-like region (Oil + Emulsion + Sheen)

They reuse the project's existing code where it exists (``src.vision.unet.UNet``) and rebuild
the other architectures exactly like the training notebooks did. Preprocessing and decision
rules (sigmoid >= 0.5, Mask2Former class id 1, YOLO imgsz=640 / conf=0.25 / retina masks) are the
ones used in the evaluation notebooks. Nothing here is trained or fitted at runtime.
"""

from __future__ import annotations

import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from ..config import Settings
from ..errors import InferenceError, ModelLoadError
from ..imaging import MODEL_INPUT_SIZE, resize_for_model, to_model_tensor
from ..registry import ModelSpec

THRESHOLD = 0.5
log = logging.getLogger("petrovision")


@dataclass
class InstancePrediction:
    mask: np.ndarray                 # bool [out_h, out_w]
    confidence: float | None = None  # model-reported confidence (None for derived regions)
    class_id: int | None = None
    class_name: str | None = None


@dataclass
class Prediction:
    mask: np.ndarray                              # union of everything predicted as petroleum-like
    instances: list | None = None                 # list[InstancePrediction] for instance models, else None


def _torch():
    import torch
    return torch


def read_checkpoint(path: Path):
    """Load a trusted local checkpoint. Falls back to full unpickling for training checkpoints
    (they contain optimizer state / python scalars, as saved by the project notebooks)."""
    torch = _torch()
    try:
        return torch.load(path, map_location="cpu", weights_only=True)
    except Exception:
        return torch.load(path, map_location="cpu", weights_only=False)


def extract_state_dict(checkpoint) -> dict:
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        return checkpoint["model_state_dict"]
    return checkpoint


def checkpoint_meta(checkpoint) -> dict:
    """Small, JSON-safe subset of whatever the checkpoint recorded about its own training."""
    meta = {}
    if isinstance(checkpoint, dict):
        for key in ("experiment_id", "epoch", "best_epoch", "validation_loss", "best_validation_loss", "model_name"):
            value = checkpoint.get(key)
            if isinstance(value, (str, int, float)):
                meta[key] = value
    return meta


class BasePredictor:
    def __init__(self, spec: ModelSpec, checkpoint: Path, device, settings: Settings):
        self.spec = spec
        self.checkpoint = checkpoint
        self.device = device
        self.settings = settings
        self.lock = threading.Lock()          # one inference at a time per model instance
        self.loaded = False
        self.load_seconds: float | None = None
        self.parameters: int | None = None
        self.checkpoint_info: dict = {}
        self._model = None

    # -- lifecycle -----------------------------------------------------------------
    def load(self) -> None:
        start = time.perf_counter()
        try:
            self._load()
        except ModelLoadError:
            raise
        except Exception as exc:  # surface a readable message instead of a stack trace
            log.exception("Could not load %s from %s", self.spec.label, self.checkpoint)
            raise ModelLoadError(f"{self.spec.label} could not be started.") from exc
        self._sync()
        self.load_seconds = round(time.perf_counter() - start, 3)
        self.loaded = True

    def unload(self) -> None:
        self._model = None
        self.loaded = False
        try:
            torch = _torch()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _load(self) -> None:
        raise NotImplementedError

    def predict_mask(self, image: Image.Image, out_size: tuple) -> np.ndarray:
        raise NotImplementedError

    def predict(self, image: Image.Image, out_size: tuple) -> Prediction:
        """Union mask (+ per-instance masks for instance-segmentation models)."""
        return Prediction(mask=self.predict_mask(image, out_size))

    def warm_up(self) -> None:
        """Run one throw-away forward pass on a blank image so the first user request is not
        slowed by lazy initialisation. The output is discarded and never shown as a result."""
        self.predict_mask(Image.new("RGB", MODEL_INPUT_SIZE, (127, 127, 127)), MODEL_INPUT_SIZE)

    # -- helpers ---------------------------------------------------------------------
    def _sync(self) -> None:
        torch = _torch()
        if self.device.type == "cuda":
            torch.cuda.synchronize()

    def _count_parameters(self, module) -> int:
        return int(sum(p.numel() for p in module.parameters()))

    def runtime_info(self) -> dict:
        return {
            "loaded": self.loaded,
            "device": str(self.device),
            "load_seconds": self.load_seconds,
            "parameters": self.parameters,
            "checkpoint": self.checkpoint_info,
        }

    def _logits_to_mask(self, logits, out_size: tuple) -> np.ndarray:
        """logits [1,1,h,w] -> bool mask [out_h, out_w].

        Logits are first brought to the 256x256 evaluation grid (as in the evaluation
        notebooks) and only then, if needed, resampled to the requested output size.
        """
        torch = _torch()
        F = torch.nn.functional
        out_w, out_h = out_size
        if tuple(logits.shape[-2:]) != (MODEL_INPUT_SIZE[1], MODEL_INPUT_SIZE[0]):
            logits = F.interpolate(logits, size=(MODEL_INPUT_SIZE[1], MODEL_INPUT_SIZE[0]),
                                   mode="bilinear", align_corners=False)
        if (out_h, out_w) != (MODEL_INPUT_SIZE[1], MODEL_INPUT_SIZE[0]):
            logits = F.interpolate(logits, size=(out_h, out_w), mode="bilinear", align_corners=False)
        return (torch.sigmoid(logits) >= THRESHOLD)[0, 0].cpu().numpy()


class _SemanticBinaryPredictor(BasePredictor):
    """U-Net / DeepLabV3+ / SegFormer: single-channel logits, sigmoid >= 0.5."""

    def _forward_logits(self, tensor):
        raise NotImplementedError

    def predict_mask(self, image, out_size):
        torch = _torch()
        try:
            with self.lock, torch.inference_mode():
                tensor = to_model_tensor(image).to(self.device)
                logits = self._forward_logits(tensor)
                mask = self._logits_to_mask(logits, out_size)
        except torch.cuda.OutOfMemoryError as exc:
            raise InferenceError("The analysis ran out of memory. Try a smaller image or another model.", code="gpu_out_of_memory") from exc
        return mask


class UNetPredictor(_SemanticBinaryPredictor):
    def _load(self):
        project_root = str(self.settings.project_root)
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from src.vision.unet import UNet   # existing PetroVision implementation (not copied)

        checkpoint = read_checkpoint(self.checkpoint)
        model = UNet(in_channels=3, out_channels=1)
        model.load_state_dict(extract_state_dict(checkpoint))
        self._model = model.to(self.device).eval()
        self.parameters = self._count_parameters(model)
        self.checkpoint_info = checkpoint_meta(checkpoint)

    def _forward_logits(self, tensor):
        return self._model(tensor)


class DeepLabPredictor(_SemanticBinaryPredictor):
    def _load(self):
        import segmentation_models_pytorch as smp

        checkpoint = read_checkpoint(self.checkpoint)
        # encoder_weights=None: ImageNet weights are already inside the fine-tuned checkpoint.
        model = smp.DeepLabV3Plus(
            encoder_name="resnet50", encoder_weights=None, in_channels=3, classes=1, activation=None
        )
        model.load_state_dict(extract_state_dict(checkpoint))
        self._model = model.to(self.device).eval()
        self.parameters = self._count_parameters(model)
        self.checkpoint_info = checkpoint_meta(checkpoint)

    def _forward_logits(self, tensor):
        return self._model(tensor)


class SegFormerPredictor(_SemanticBinaryPredictor):
    def _load(self):
        from transformers import SegformerConfig, SegformerForSemanticSegmentation

        checkpoint = read_checkpoint(self.checkpoint)
        # SegformerConfig defaults are the MiT-B0 hyper-parameters (nvidia/mit-b0); the pretrained
        # weights are fully replaced by the fine-tuned checkpoint, so no download is needed.
        config = SegformerConfig(num_labels=1, id2label={0: "petroleum"}, label2id={"petroleum": 0})
        model = SegformerForSemanticSegmentation(config)
        model.load_state_dict(extract_state_dict(checkpoint))
        self._model = model.to(self.device).eval()
        self.parameters = self._count_parameters(model)
        self.checkpoint_info = checkpoint_meta(checkpoint)

    def _forward_logits(self, tensor):
        return self._model(pixel_values=tensor).logits


class Mask2FormerPredictor(BasePredictor):
    def _load(self):
        from transformers import AutoImageProcessor, Mask2FormerConfig, Mask2FormerForUniversalSegmentation

        source = self.settings.mask2former_source
        checkpoint = read_checkpoint(self.checkpoint)
        id2label = {0: "background", 1: "petroleum"}
        label2id = {"background": 0, "petroleum": 1}
        try:
            config = Mask2FormerConfig.from_pretrained(source, num_labels=2, id2label=id2label, label2id=label2id)
            self._processor = AutoImageProcessor.from_pretrained(
                source, do_resize=True, size={"height": MODEL_INPUT_SIZE[1], "width": MODEL_INPUT_SIZE[0]}
            )
        except Exception as exc:
            log.error("Mask2Former configuration unavailable from '%s' (needs internet on first run, or "
                      "PETROVISION_MASK2FORMER_SOURCE pointing to a local folder): %s", source, exc)
            raise ModelLoadError("Mask2Former could not be started.") from exc
        config.num_labels, config.id2label, config.label2id = 2, id2label, label2id
        model = Mask2FormerForUniversalSegmentation(config)   # weights come from the checkpoint
        model.load_state_dict(extract_state_dict(checkpoint))
        self._model = model.to(self.device).eval()
        self.parameters = self._count_parameters(model)
        self.checkpoint_info = checkpoint_meta(checkpoint)

    def predict_mask(self, image, out_size):
        torch = _torch()
        out_w, out_h = out_size
        try:
            with self.lock, torch.inference_mode():
                # Same pipeline as evaluation: dataset-style 256x256 resize -> uint8 -> HF processor.
                small = np.array(resize_for_model(image), dtype=np.uint8)
                inputs = self._processor(images=small, return_tensors="pt")
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                outputs = self._model(**inputs)
                semantic = self._processor.post_process_semantic_segmentation(
                    outputs, target_sizes=[(out_h, out_w)]
                )[0]
                mask = (semantic == 1).cpu().numpy()      # class 1 = petroleum, 0 = background
        except torch.cuda.OutOfMemoryError as exc:
            raise InferenceError("The analysis ran out of memory. Try a smaller image or another model.", code="gpu_out_of_memory") from exc
        return mask


class YoloPredictor(BasePredictor):
    DEFAULT_IMGSZ = 640
    CONF = 0.25

    def _load(self):
        from ultralytics import YOLO

        self._yolo = YOLO(str(self.checkpoint))
        if getattr(self._yolo, "task", None) != "segment":
            raise ModelLoadError(f"{self.checkpoint.name} is not a YOLO segmentation model.")
        self._yolo_device = 0 if self.device.type == "cuda" else "cpu"
        self._model = self._yolo
        # Use the image size the checkpoint was trained with (640 for the LADOS YOLO11 run).
        try:
            self.imgsz = int((self._yolo.overrides or {}).get("imgsz") or self.DEFAULT_IMGSZ)
        except (TypeError, ValueError):
            self.imgsz = self.DEFAULT_IMGSZ
        self.class_names = {int(k): str(v) for k, v in dict(self._yolo.names).items()}
        wanted = self.settings.target_classes.get(self.spec.id)
        self.target_ids = None
        if wanted:
            self.target_ids = {k for k, v in self.class_names.items() if v.lower() in wanted}
            if not self.target_ids:
                log.warning("%s: configured target classes %s match none of %s", self.spec.id, wanted, self.class_names)
        self.parameters = self._count_parameters(self._yolo.model)
        self.checkpoint_info = {"task": self._yolo.task, "classes": self.class_names, "imgsz": self.imgsz}

    def predict(self, image, out_size) -> Prediction:
        import cv2

        out_w, out_h = out_size
        try:
            with self.lock:
                result = self._yolo.predict(
                    source=image, imgsz=self.imgsz, conf=self.CONF, retina_masks=True,
                    device=self._yolo_device, verbose=False,
                )[0]
        except Exception as exc:
            if exc.__class__.__name__ == "OutOfMemoryError":
                raise InferenceError("The analysis ran out of memory. Try a smaller image or another model.", code="gpu_out_of_memory") from exc
            raise

        instances: list[InstancePrediction] = []
        if result.masks is not None and len(result.masks.data) > 0:
            masks = (result.masks.data.detach().cpu().numpy() > 0.5)
            confs = result.boxes.conf.detach().cpu().numpy().tolist()
            classes = result.boxes.cls.detach().cpu().numpy().astype(int).tolist()
            for m, conf, cid in zip(masks, confs, classes):
                if self.target_ids is not None and cid not in self.target_ids:
                    continue
                m8 = m.astype(np.uint8)
                if m8.shape != (out_h, out_w):
                    m8 = cv2.resize(m8, (out_w, out_h), interpolation=cv2.INTER_NEAREST)
                if m8.any():
                    instances.append(InstancePrediction(m8.astype(bool), float(conf), cid, self.class_names.get(cid)))
        instances.sort(key=lambda i: -(i.confidence or 0.0))      # Instance 01 = highest confidence
        union = np.zeros((out_h, out_w), dtype=bool)
        for inst in instances:
            union |= inst.mask
        return Prediction(mask=union, instances=instances)

    def predict_mask(self, image, out_size):
        return self.predict(image, out_size).mask

    def unload(self):
        self._yolo = None
        super().unload()


PREDICTOR_CLASSES = {
    "unet": UNetPredictor,
    "deeplab": DeepLabPredictor,
    "segformer": SegFormerPredictor,
    "mask2former": Mask2FormerPredictor,
    "yolo": YoloPredictor,
    "yolo26": YoloPredictor,
}
