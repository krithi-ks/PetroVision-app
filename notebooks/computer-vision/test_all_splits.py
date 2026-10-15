from pathlib import Path

from src.vision.lados_dataset import LADOSDataset


PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"


EXPECTED_SIZES = {
    "train": 2370,
    "valid": 675,
    "test": 343,
}


def main():

    print("=" * 60)
    print("PetroVision - LADOS Split Verification")
    print("=" * 60)

    for split in ["train", "valid", "test"]:

        print(f"\nChecking: {split}")

        dataset = LADOSDataset(
            root_dir=DATASET_ROOT,
            split=split,
            image_size=(256, 256),
        )

        print(f"Dataset size: {len(dataset)}")

        expected = EXPECTED_SIZES[split]

        assert len(dataset) == expected, (
            f"{split}: expected {expected}, "
            f"found {len(dataset)}"
        )

        # Test one sample
        image, mask = dataset[0]

        print(f"Image shape: {image.shape}")
        print(f"Mask shape : {mask.shape}")

        assert image.shape == (3, 256, 256)
        assert mask.shape == (1, 256, 256)

        print("✓ Passed")

    print("\n" + "=" * 60)
    print("ALL THREE SPLITS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()