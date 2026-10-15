import sys
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
import torch
from PIL import Image
from torch.utils.data import DataLoader

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))

from src.vision.lados_dataset import LADOSDataset
from src.vision.unet import UNet


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

DATASET_ROOT = PROJECT_ROOT / "data" / "lados"
MODEL_PATH = PROJECT_ROOT / "models" / "unet_pilot_best.pt"

OUTPUT_DIR = PROJECT_ROOT / "results" / "figures"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_SIZE = (256, 256)
THRESHOLD = 0.5

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ---------------------------------------------------------
# Load model
# ---------------------------------------------------------

model = UNet(
    in_channels=3,
    out_channels=1,
)

checkpoint = torch.load(
    MODEL_PATH,
    map_location=DEVICE,
)

if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
    model.load_state_dict(checkpoint["model_state_dict"])
else:
    model.load_state_dict(checkpoint)

model = model.to(DEVICE)
model.eval()


# ---------------------------------------------------------
# Load test dataset
# ---------------------------------------------------------

test_dataset = LADOSDataset(
    root_dir=DATASET_ROOT,
    split="test",
    image_size=IMAGE_SIZE,
    augment=False,
)

test_loader = DataLoader(
    test_dataset,
    batch_size=1,
    shuffle=False,
    num_workers=0,
)


# ---------------------------------------------------------
# Select samples
# ---------------------------------------------------------

sample_indices = [0, 50, 100, 150, 200, 250, 300]


for sample_index in sample_indices:

    image, target = test_dataset[sample_index]

    input_tensor = image.unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(input_tensor)
        probability = torch.sigmoid(logits)

    prediction = (
        probability[0, 0].cpu().numpy() >= THRESHOLD
    ).astype(np.uint8)

    image_np = image.permute(1, 2, 0).numpy()

    target_np = target[0].numpy()

    # -----------------------------------------------------
    # Coverage
    # -----------------------------------------------------

    target_coverage = target_np.mean() * 100
    prediction_coverage = prediction.mean() * 100

    # -----------------------------------------------------
    # Create overlay
    # -----------------------------------------------------

    overlay = image_np.copy()

    # Highlight predicted petroleum region
    overlay[prediction == 1] = (
        0.7 * overlay[prediction == 1]
        + 0.3 * np.array([1.0, 0.0, 0.0])
    )

    # -----------------------------------------------------
    # Plot
    # -----------------------------------------------------

    fig, axes = plt.subplots(1, 4, figsize=(16, 4))

    axes[0].imshow(image_np)
    axes[0].set_title("Original Image")

    axes[1].imshow(target_np, cmap="gray")
    axes[1].set_title(
        f"Ground Truth\nCoverage: {target_coverage:.1f}%"
    )

    axes[2].imshow(prediction, cmap="gray")
    axes[2].set_title(
        f"U-Net Prediction\nCoverage: {prediction_coverage:.1f}%"
    )

    axes[3].imshow(overlay)
    axes[3].set_title("Prediction Overlay")

    for ax in axes:
        ax.axis("off")

    plt.tight_layout()

    output_path = (
        OUTPUT_DIR /
        f"unet_prediction_{sample_index}.png"
    )

    plt.savefig(
        output_path,
        dpi=150,
        bbox_inches="tight",
    )

    plt.close()

    print(
        f"Saved: {output_path}"
    )


print("\n" + "=" * 70)
print("PREDICTION VISUALIZATION COMPLETE")
print("=" * 70)