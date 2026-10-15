from pathlib import Path

import torch
from torch.utils.data import DataLoader

from src.vision.lados_dataset import LADOSDataset


PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"

BATCH_SIZE = 8


def main():

    print("=" * 60)
    print("PetroVision - LADOS DataLoader Test")
    print("=" * 60)

    dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="train",
        image_size=(256, 256),
    )

    dataloader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,
    )

    print(f"\nDataset size : {len(dataset)}")
    print(f"Batch size   : {BATCH_SIZE}")
    print(f"Number batches: {len(dataloader)}")

    # Get one batch
    images, masks = next(iter(dataloader))

    print("\n--- Batch ---")
    print(f"Images shape: {images.shape}")
    print(f"Masks shape : {masks.shape}")

    print("\n--- Batch values ---")
    print(
        f"Image range: "
        f"{images.min().item():.4f} → "
        f"{images.max().item():.4f}"
    )

    print(
        f"Mask values: "
        f"{torch.unique(masks).tolist()}"
    )

    # Validation
    assert images.shape == (
        BATCH_SIZE,
        3,
        256,
        256,
    )

    assert masks.shape == (
        BATCH_SIZE,
        1,
        256,
        256,
    )

    assert images.dtype == torch.float32
    assert masks.dtype == torch.float32

    assert set(
        torch.unique(masks).tolist()
    ).issubset({0.0, 1.0})

    print("\n" + "=" * 60)
    print("DATALOADER TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()