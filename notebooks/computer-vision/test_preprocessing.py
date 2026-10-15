from pathlib import Path
from PIL import Image
import numpy as np


# ============================================================
# PetroVision - LADOS Preprocessing Test
# ============================================================

# Dataset paths
PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"

IMAGE_SIZE = (256, 256)

# LADOS class IDs
BACKGROUND = 0
EMULSION = 1
OIL = 2
OIL_PLATFORM = 3
SHEEN = 4
SHIP = 5

# Petroleum-related visible liquid classes
PETROLEUM_CLASSES = {OIL, EMULSION, SHEEN}


def find_first_sample():
    """Find the first valid image-mask pair."""

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


def preprocess_image(image_path):
    """Load and resize RGB image."""

    image = Image.open(image_path).convert("RGB")

    original_size = image.size

    image = image.resize(
        IMAGE_SIZE,
        Image.Resampling.BILINEAR
    )

    image_array = np.asarray(image, dtype=np.float32)

    # Normalize pixel values from [0, 255] to [0, 1]
    image_array = image_array / 255.0

    return image_array, original_size


def preprocess_mask(mask_path):
    """Load mask, resize without changing class IDs,
    then convert to binary petroleum mask.
    """

    mask = Image.open(mask_path).convert("L")

    original_size = mask.size

    # IMPORTANT:
    # Nearest-neighbor must be used for segmentation masks.
    mask = mask.resize(
        IMAGE_SIZE,
        Image.Resampling.NEAREST
    )

    mask_array = np.asarray(mask, dtype=np.uint8)

    # Check that resizing did not create invalid class IDs
    valid_classes = set(np.unique(mask_array))

    allowed_classes = {
        BACKGROUND,
        EMULSION,
        OIL,
        OIL_PLATFORM,
        SHEEN,
        SHIP
    }

    invalid_classes = valid_classes - allowed_classes

    if invalid_classes:
        raise ValueError(
            f"Invalid class IDs found: {invalid_classes}"
        )

    # Convert multiclass mask into binary petroleum mask
    binary_mask = np.isin(
        mask_array,
        list(PETROLEUM_CLASSES)
    ).astype(np.uint8)

    return mask_array, binary_mask, original_size


def main():

    image_path, mask_path = find_first_sample()

    print("=" * 60)
    print("PetroVision - LADOS Preprocessing Test")
    print("=" * 60)

    print(f"\nImage: {image_path.name}")
    print(f"Mask : {mask_path.name}")

    # --------------------------------------------------------
    # Image preprocessing
    # --------------------------------------------------------

    image, image_original_size = preprocess_image(image_path)

    # --------------------------------------------------------
    # Mask preprocessing
    # --------------------------------------------------------

    mask, binary_mask, mask_original_size = preprocess_mask(mask_path)

    # --------------------------------------------------------
    # Results
    # --------------------------------------------------------

    print("\n--- Original Sizes ---")
    print(f"Image: {image_original_size}")
    print(f"Mask : {mask_original_size}")

    print("\n--- Preprocessed Shapes ---")
    print(f"Image      : {image.shape}")
    print(f"Class mask : {mask.shape}")
    print(f"Binary mask: {binary_mask.shape}")

    print("\n--- Image Values ---")
    print(f"Data type: {image.dtype}")
    print(f"Minimum : {image.min():.4f}")
    print(f"Maximum : {image.max():.4f}")

    print("\n--- Class Mask ---")
    print(f"Data type: {mask.dtype}")
    print(f"Unique classes: {np.unique(mask)}")

    print("\n--- Binary Petroleum Mask ---")
    print(f"Data type: {binary_mask.dtype}")
    print(f"Unique values: {np.unique(binary_mask)}")

    print("\n--- Binary Pixel Distribution ---")

    total_pixels = binary_mask.size
    petroleum_pixels = np.sum(binary_mask == 1)
    background_pixels = np.sum(binary_mask == 0)

    print(f"Petroleum pixels : {petroleum_pixels}")
    print(f"Background pixels: {background_pixels}")
    print(
        f"Petroleum coverage: "
        f"{petroleum_pixels / total_pixels * 100:.2f}%"
    )

    # --------------------------------------------------------
    # Final validation
    # --------------------------------------------------------

    assert image.shape == (256, 256, 3)
    assert mask.shape == (256, 256)
    assert binary_mask.shape == (256, 256)

    assert image.min() >= 0.0
    assert image.max() <= 1.0

    assert set(np.unique(binary_mask)).issubset({0, 1})

    print("\n" + "=" * 60)
    print("PREPROCESSING TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()