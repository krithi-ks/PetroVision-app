from pathlib import Path

import torch

from src.vision.lados_dataset import LADOSDataset


PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"


def main():

    print("=" * 60)
    print("PetroVision - LADOS PyTorch Dataset Test")
    print("=" * 60)

    # --------------------------------------------------------
    # Create training dataset
    # --------------------------------------------------------

    dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="train",
        image_size=(256, 256),
    )

    print(f"\nDataset size: {len(dataset)}")

    # --------------------------------------------------------
    # Load first sample
    # --------------------------------------------------------

    image, mask = dataset[0]

    print("\n--- Image ---")
    print(f"Shape : {image.shape}")
    print(f"Dtype : {image.dtype}")
    print(f"Min   : {image.min().item():.4f}")
    print(f"Max   : {image.max().item():.4f}")

    print("\n--- Mask ---")
    print(f"Shape : {mask.shape}")
    print(f"Dtype : {mask.dtype}")
    print(
        f"Unique values: "
        f"{torch.unique(mask).tolist()}"
    )

    # --------------------------------------------------------
    # Validation checks
    # --------------------------------------------------------

    assert len(dataset) == 2370

    assert image.shape == (
        3,
        256,
        256
    )

    assert mask.shape == (
        1,
        256,
        256
    )

    assert image.dtype == torch.float32

    assert mask.dtype == torch.float32

    assert image.min() >= 0.0
    assert image.max() <= 1.0

    assert set(
        torch.unique(mask).tolist()
    ).issubset({0.0, 1.0})

    print("\n" + "=" * 60)
    print("DATASET TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()