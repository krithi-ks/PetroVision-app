from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from PIL import Image, ImageEnhance


# ============================================================
# PetroVision - LADOS Augmentation Visualization Test
# ============================================================

PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"

IMAGE_SIZE = (256, 256)

# LADOS class IDs
EMULSION = 1
OIL = 2
SHEEN = 4

PETROLEUM_CLASSES = {
    EMULSION,
    OIL,
    SHEEN,
}


def find_first_sample():

    train_dir = DATASET_ROOT / "train"

    for image_path in train_dir.iterdir():

        if not image_path.is_file():
            continue

        if image_path.name.endswith("_mask.png"):
            continue

        if image_path.suffix.lower() not in {
            ".jpg",
            ".jpeg",
            ".png",
            ".bmp",
            ".webp",
        }:
            continue

        mask_path = image_path.with_name(
            image_path.stem + "_mask.png"
        )

        if mask_path.exists():
            return image_path, mask_path

    raise FileNotFoundError(
        "No valid image-mask pair found."
    )


def load_sample(image_path, mask_path):

    image = Image.open(
        image_path
    ).convert("RGB")

    mask = Image.open(
        mask_path
    ).convert("L")

    image = image.resize(
        IMAGE_SIZE,
        Image.Resampling.BILINEAR
    )

    mask = mask.resize(
        IMAGE_SIZE,
        Image.Resampling.NEAREST
    )

    return image, mask


def binary_mask(mask):

    mask_array = np.asarray(
        mask,
        dtype=np.uint8
    )

    return np.isin(
        mask_array,
        list(PETROLEUM_CLASSES)
    )


def create_overlay(image, mask):

    image_array = np.asarray(
        image,
        dtype=np.float32
    ) / 255.0

    petroleum = binary_mask(mask)

    overlay = image_array.copy()

    # Red overlay on petroleum pixels
    overlay[petroleum] = (
        0.6 * overlay[petroleum]
        + 0.4 * np.array(
            [1.0, 0.0, 0.0]
        )
    )

    return overlay


def main():

    image_path, mask_path = find_first_sample()

    original_image, original_mask = load_sample(
        image_path,
        mask_path
    )

    # ========================================================
    # 1. Horizontal flip
    # ========================================================

    hflip_image = original_image.transpose(
        Image.Transpose.FLIP_LEFT_RIGHT
    )

    hflip_mask = original_mask.transpose(
        Image.Transpose.FLIP_LEFT_RIGHT
    )

    # ========================================================
    # 2. Vertical flip
    # ========================================================

    vflip_image = original_image.transpose(
        Image.Transpose.FLIP_TOP_BOTTOM
    )

    vflip_mask = original_mask.transpose(
        Image.Transpose.FLIP_TOP_BOTTOM
    )

    # ========================================================
    # 3. Small rotation
    # ========================================================

    rotation_angle = 8

    rotated_image = original_image.rotate(
        rotation_angle,
        resample=Image.Resampling.BILINEAR,
        expand=False
    )

    rotated_mask = original_mask.rotate(
        rotation_angle,
        resample=Image.Resampling.NEAREST,
        expand=False
    )

    # ========================================================
    # 4. Brightness / contrast
    #
    # Only the IMAGE changes.
    # The MASK must remain unchanged.
    # ========================================================

    enhanced_image = ImageEnhance.Brightness(
        original_image
    ).enhance(1.15)

    enhanced_image = ImageEnhance.Contrast(
        enhanced_image
    ).enhance(1.10)

    enhanced_mask = original_mask.copy()

    # ========================================================
    # Prepare visualizations
    # ========================================================

    samples = [
        (
            "Original",
            original_image,
            original_mask
        ),
        (
            "Horizontal Flip",
            hflip_image,
            hflip_mask
        ),
        (
            "Vertical Flip",
            vflip_image,
            vflip_mask
        ),
        (
            "Rotation +8°",
            rotated_image,
            rotated_mask
        ),
        (
            "Brightness + Contrast",
            enhanced_image,
            enhanced_mask
        ),
    ]

    fig, axes = plt.subplots(
        2,
        5,
        figsize=(18, 7)
    )

    for index, (
        title,
        image,
        mask
    ) in enumerate(samples):

        # Image
        axes[0, index].imshow(image)
        axes[0, index].set_title(title)
        axes[0, index].axis("off")

        # Overlay
        overlay = create_overlay(
            image,
            mask
        )

        axes[1, index].imshow(overlay)
        axes[1, index].set_title(
            "Petroleum Overlay"
        )
        axes[1, index].axis("off")

    plt.suptitle(
        "PetroVision - Augmentation Alignment Test",
        fontsize=14
    )

    plt.tight_layout()

    output_path = (
        PROJECT_ROOT
        / "data"
        / "lados"
        / "augmentation_visualization.png"
    )

    plt.savefig(
        output_path,
        dpi=150,
        bbox_inches="tight"
    )

    plt.show()

    print("\n" + "=" * 60)
    print("AUGMENTATION VISUALIZATION COMPLETE")
    print("=" * 60)

    print(f"\nSample image: {image_path.name}")

    print("\nAugmentations tested:")
    print("1. Horizontal flip")
    print("2. Vertical flip")
    print("3. Rotation +8 degrees")
    print("4. Brightness + contrast")

    print("\nSaved visualization to:")
    print(output_path)


if __name__ == "__main__":
    main()