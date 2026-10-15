from pathlib import Path

import torch
from torch.utils.data import DataLoader

from src.vision.lados_dataset import LADOSDataset
from src.vision.unet import UNet
from src.vision.segmentation_loss import BCEDiceLoss


# ============================================================
# PetroVision - Complete Training Pipeline Test
# ============================================================

PROJECT_ROOT = Path(r"C:\PetroVision")
DATASET_ROOT = PROJECT_ROOT / "data" / "lados"


def main():

    print("=" * 60)
    print("PetroVision - Complete Training Pipeline Test")
    print("=" * 60)

    # --------------------------------------------------------
    # Device
    # --------------------------------------------------------

    device = torch.device("cpu")

    print("\nDevice:")
    print(device)

    # --------------------------------------------------------
    # Dataset
    #
    # Augmentation enabled because this is the training
    # pipeline.
    # --------------------------------------------------------

    dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="train",
        image_size=(256, 256),
        augment=True,
    )

    print("\nDataset size:")
    print(len(dataset))

    # --------------------------------------------------------
    # DataLoader
    # --------------------------------------------------------

    loader = DataLoader(
        dataset,
        batch_size=2,
        shuffle=True,
        num_workers=0,
    )

    print("\nDataLoader:")
    print("Batch size:", loader.batch_size)

    # --------------------------------------------------------
    # Get one real batch
    # --------------------------------------------------------

    images, masks = next(iter(loader))

    images = images.to(device)
    masks = masks.to(device)

    print("\nReal LADOS batch:")
    print("Images:", images.shape)
    print("Masks :", masks.shape)

    print(
        "Image range:",
        images.min().item(),
        "→",
        images.max().item()
    )

    print(
        "Mask values:",
        torch.unique(masks).tolist()
    )

    # --------------------------------------------------------
    # Model
    # --------------------------------------------------------

    model = UNet(
        in_channels=3,
        out_channels=1
    ).to(device)

    print("\nU-Net created.")

    # --------------------------------------------------------
    # Loss
    # --------------------------------------------------------

    criterion = BCEDiceLoss(
        bce_weight=0.5,
        dice_weight=0.5
    )

    # --------------------------------------------------------
    # Optimizer
    #
    # Adam is being used for the initial baseline.
    # Learning rate will be experimentally evaluated later.
    # --------------------------------------------------------

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=1e-3
    )

    # --------------------------------------------------------
    # Forward pass
    # --------------------------------------------------------

    model.train()

    logits = model(images)

    print("\nModel output:")
    print("Logits:", logits.shape)

    # --------------------------------------------------------
    # Calculate loss
    # --------------------------------------------------------

    loss = criterion(
        logits,
        masks
    )

    print("\nLoss:")
    print(loss.item())

    # --------------------------------------------------------
    # Backward pass
    # --------------------------------------------------------

    optimizer.zero_grad()

    loss.backward()

    print("\nBackward pass completed.")

    # --------------------------------------------------------
    # Check gradients
    # --------------------------------------------------------

    gradient_count = 0
    all_gradients_finite = True

    for parameter in model.parameters():

        if parameter.grad is not None:

            gradient_count += 1

            if not torch.isfinite(
                parameter.grad
            ).all():

                all_gradients_finite = False

    print(
        "Parameters with gradients:",
        gradient_count
    )

    print(
        "All gradients finite:",
        all_gradients_finite
    )

    # --------------------------------------------------------
    # Optimizer update
    # --------------------------------------------------------

    optimizer.step()

    print("\nOptimizer step completed.")

    # --------------------------------------------------------
    # Assertions
    # --------------------------------------------------------

    assert images.shape == (
        2,
        3,
        256,
        256
    )

    assert masks.shape == (
        2,
        1,
        256,
        256
    )

    assert logits.shape == (
        2,
        1,
        256,
        256
    )

    assert torch.isfinite(loss)

    assert gradient_count > 0

    assert all_gradients_finite

    print("\n" + "=" * 60)
    print("COMPLETE TRAINING PIPELINE TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()