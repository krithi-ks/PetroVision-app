from pathlib import Path
from PIL import Image
import numpy as np
import matplotlib.pyplot as plt


# ============================================================
# PetroVision - LADOS Preprocessing Visualization
# ============================================================

PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"

IMAGE_SIZE = (256, 256)

BACKGROUND = 0
EMULSION = 1
OIL = 2
OIL_PLATFORM = 3
SHEEN = 4
SHIP = 5

PETROLEUM_CLASSES = {OIL, EMULSION, SHEEN}


def find_first_sample():

    train_dir = DATASET_ROOT / "train"

    for image_path in train_dir.glob("*"):

        if image_path.name.endswith("_mask.png"):
            continue

        mask_path = image_path.with_name(
            image_path.stem + "_mask.png"
        )

        if mask_path.exists():
            return image_path, mask_path

    raise FileNotFoundError("No image-mask pair found.")


def main():

    image_path, mask_path = find_first_sample()

    # --------------------------------------------------------
    # Load
    # --------------------------------------------------------

    image = Image.open(image_path).convert("RGB")
    mask = Image.open(mask_path).convert("L")

    # --------------------------------------------------------
    # Resize
    # --------------------------------------------------------

    image_resized = image.resize(
        IMAGE_SIZE,
        Image.Resampling.BILINEAR
    )

    mask_resized = mask.resize(
        IMAGE_SIZE,
        Image.Resampling.NEAREST
    )

    # --------------------------------------------------------
    # Convert to arrays
    # --------------------------------------------------------

    image_array = np.asarray(
        image_resized,
        dtype=np.float32
    ) / 255.0

    mask_array = np.asarray(
        mask_resized,
        dtype=np.uint8
    )

    # --------------------------------------------------------
    # Binary petroleum mask
    # --------------------------------------------------------

    binary_mask = np.isin(
        mask_array,
        list(PETROLEUM_CLASSES)
    )

    # --------------------------------------------------------
    # Overlay
    # --------------------------------------------------------

    overlay = image_array.copy()

    # Red overlay on petroleum pixels
    overlay[binary_mask] = (
        0.6 * overlay[binary_mask]
        + 0.4 * np.array([1.0, 0.0, 0.0])
    )

    # --------------------------------------------------------
    # Display
    # --------------------------------------------------------

    fig, axes = plt.subplots(
        1,
        4,
        figsize=(16, 4)
    )

    axes[0].imshow(image_array)
    axes[0].set_title("Original Image → 256×256")
    axes[0].axis("off")

    axes[1].imshow(mask_array)
    axes[1].set_title("Class Mask → 256×256")
    axes[1].axis("off")

    axes[2].imshow(binary_mask, cmap="gray")
    axes[2].set_title("Binary Petroleum Mask")
    axes[2].axis("off")

    axes[3].imshow(overlay)
    axes[3].set_title("Preprocessed Overlay")
    axes[3].axis("off")

    plt.tight_layout()

    output_path = (
        PROJECT_ROOT
        / "data"
        / "lados"
        / "preprocessing_visualization.png"
    )

    plt.savefig(
        output_path,
        dpi=150,
        bbox_inches="tight"
    )

    plt.show()

    print(f"\nSaved visualization to:")
    print(output_path)


if __name__ == "__main__":
    main()