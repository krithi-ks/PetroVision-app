from pathlib import Path

import torch

from src.vision.lados_dataset import LADOSDataset


PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"


def main():

    print("=" * 60)
    print("PetroVision - Dataset Augmentation Test")
    print("=" * 60)

    # --------------------------------------------------------
    # Training dataset WITH augmentation
    # --------------------------------------------------------

    train_aug = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="train",
        image_size=(256, 256),
        augment=True,
    )

    train_image, train_mask = train_aug[0]

    print("\nTraining dataset:")
    print("Size:", len(train_aug))
    print("Augmentation enabled:", train_aug.augment)
    print("Image shape:", train_image.shape)
    print("Mask shape:", train_mask.shape)
    print("Image dtype:", train_image.dtype)
    print("Mask dtype:", train_mask.dtype)
    print("Image range:",
          train_image.min().item(),
          "→",
          train_image.max().item())
    print("Mask values:",
          torch.unique(train_mask).tolist())

    # --------------------------------------------------------
    # Validation dataset
    # --------------------------------------------------------

    valid = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="valid",
        image_size=(256, 256),
        augment=True,   # intentionally True
    )

    print("\nValidation dataset:")
    print("Size:", len(valid))
    print("Requested augmentation: True")
    print("Actual augmentation:", valid.augment)

    # --------------------------------------------------------
    # Test dataset
    # --------------------------------------------------------

    test = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="test",
        image_size=(256, 256),
        augment=True,   # intentionally True
    )

    print("\nTest dataset:")
    print("Size:", len(test))
    print("Requested augmentation: True")
    print("Actual augmentation:", test.augment)

    # --------------------------------------------------------
    # Assertions
    # --------------------------------------------------------

    assert train_aug.augment is True
    assert valid.augment is False
    assert test.augment is False

    assert train_image.shape == (
        3,
        256,
        256
    )

    assert train_mask.shape == (
        1,
        256,
        256
    )

    assert train_image.dtype == torch.float32
    assert train_mask.dtype == torch.float32

    assert train_image.min() >= 0.0
    assert train_image.max() <= 1.0

    mask_values = set(
        torch.unique(train_mask).tolist()
    )

    assert mask_values.issubset(
        {0.0, 1.0}
    )

    print("\n" + "=" * 60)
    print("DATASET AUGMENTATION TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()