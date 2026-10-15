import sys
from pathlib import Path

import torch
from torch.utils.data import DataLoader

# Add project root to Python path
PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.vision.lados_dataset import LADOSDataset
from src.vision.unet import UNet


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

DATASET_ROOT = PROJECT_ROOT / "data" / "lados"
MODEL_PATH = PROJECT_ROOT / "models" / "unet_pilot_best.pt"

IMAGE_SIZE = (256, 256)
BATCH_SIZE = 4
THRESHOLD = 0.5

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ---------------------------------------------------------
# Metrics
# ---------------------------------------------------------

def calculate_metrics(predictions, targets):
    """
    Calculate binary segmentation metrics.
    """

    predictions = predictions.bool()
    targets = targets.bool()

    tp = (predictions & targets).sum().item()
    fp = (predictions & ~targets).sum().item()
    fn = (~predictions & targets).sum().item()
    tn = (~predictions & ~targets).sum().item()

    epsilon = 1e-8

    iou = tp / (tp + fp + fn + epsilon)

    dice = (2 * tp) / (
        2 * tp + fp + fn + epsilon
    )

    precision = tp / (tp + fp + epsilon)

    recall = tp / (tp + fn + epsilon)

    return iou, dice, precision, recall, tp, fp, fn, tn


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():

    print("=" * 70)
    print("PetroVision - U-Net Test Evaluation")
    print("=" * 70)

    print(f"\nDevice: {DEVICE}")
    print(f"Model: {MODEL_PATH}")

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model checkpoint not found:\n{MODEL_PATH}"
        )

    # -----------------------------------------------------
    # Test dataset
    # -----------------------------------------------------

    test_dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="test",
        image_size=IMAGE_SIZE,
        augment=False,
    )

    test_loader = DataLoader(
        test_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )

    print(f"\nTest images: {len(test_dataset)}")
    print(f"Batch size: {BATCH_SIZE}")

    # -----------------------------------------------------
    # Model
    # -----------------------------------------------------

    model = UNet(
        in_channels=3,
        out_channels=1,
    )

    checkpoint = torch.load(
        MODEL_PATH,
        map_location=DEVICE,
    )

    # Support both direct state_dict and checkpoint dictionary
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        model.load_state_dict(checkpoint["model_state_dict"])
    else:
        model.load_state_dict(checkpoint)

    model = model.to(DEVICE)
    model.eval()

    print("\nModel loaded successfully.")

    # -----------------------------------------------------
    # Evaluation
    # -----------------------------------------------------

    total_tp = 0
    total_fp = 0
    total_fn = 0
    total_tn = 0

    total_batches = len(test_loader)

    with torch.no_grad():

        for batch_index, (images, masks) in enumerate(test_loader, start=1):

            images = images.to(DEVICE)
            masks = masks.to(DEVICE)

            logits = model(images)

            probabilities = torch.sigmoid(logits)

            predictions = probabilities >= THRESHOLD

            targets = masks >= 0.5

            (
                _iou,
                _dice,
                _precision,
                _recall,
                tp,
                fp,
                fn,
                tn,
            ) = calculate_metrics(
                predictions,
                targets,
            )

            total_tp += tp
            total_fp += fp
            total_fn += fn
            total_tn += tn

            if batch_index % 20 == 0 or batch_index == total_batches:
                print(
                    f"Evaluated {batch_index}/{total_batches} batches"
                )

    # -----------------------------------------------------
    # Final metrics
    # -----------------------------------------------------

    epsilon = 1e-8

    iou = total_tp / (
        total_tp + total_fp + total_fn + epsilon
    )

    dice = (2 * total_tp) / (
        2 * total_tp + total_fp + total_fn + epsilon
    )

    precision = total_tp / (
        total_tp + total_fp + epsilon
    )

    recall = total_tp / (
        total_tp + total_fn + epsilon
    )

    accuracy = (
        total_tp + total_tn
    ) / (
        total_tp + total_tn + total_fp + total_fn + epsilon
    )

    # -----------------------------------------------------
    # Results
    # -----------------------------------------------------

    print("\n" + "=" * 70)
    print("TEST SET RESULTS")
    print("=" * 70)

    print(f"\nIoU       : {iou:.4f}")
    print(f"Dice      : {dice:.4f}")
    print(f"Precision : {precision:.4f}")
    print(f"Recall    : {recall:.4f}")
    print(f"Accuracy  : {accuracy:.4f}")

    print("\nPixel counts:")
    print(f"TP: {total_tp}")
    print(f"FP: {total_fp}")
    print(f"FN: {total_fn}")
    print(f"TN: {total_tn}")

    print("\n" + "=" * 70)
    print("TEST EVALUATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()