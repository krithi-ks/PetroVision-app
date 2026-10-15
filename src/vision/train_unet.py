from pathlib import Path

import torch
from torch.utils.data import DataLoader

from src.vision.lados_dataset import LADOSDataset
from src.vision.unet import UNet
from src.vision.segmentation_loss import BCEDiceLoss


# ============================================================
# PetroVision - U-Net Pilot Training
# ============================================================

PROJECT_ROOT = Path(r"C:\PetroVision")

DATASET_ROOT = PROJECT_ROOT / "data" / "lados"

MODEL_DIR = PROJECT_ROOT / "models"

MODEL_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# Configuration
# ============================================================

IMAGE_SIZE = (256, 256)

BATCH_SIZE = 4

EPOCHS = 5

LEARNING_RATE = 1e-3

DEVICE = torch.device("cpu")


# ============================================================
# Training function
# ============================================================

def train_one_epoch(
    model,
    loader,
    criterion,
    optimizer,
    device
):

    model.train()

    running_loss = 0.0

    for images, masks in loader:

        images = images.to(device)
        masks = masks.to(device)

        # ----------------------------------------------------
        # Forward
        # ----------------------------------------------------

        logits = model(images)

        # ----------------------------------------------------
        # Loss
        # ----------------------------------------------------

        loss = criterion(
            logits,
            masks
        )

        # ----------------------------------------------------
        # Backpropagation
        # ----------------------------------------------------

        optimizer.zero_grad()

        loss.backward()

        optimizer.step()

        running_loss += (
            loss.item() * images.size(0)
        )

    epoch_loss = (
        running_loss / len(loader.dataset)
    )

    return epoch_loss


# ============================================================
# Validation function
# ============================================================

def validate(
    model,
    loader,
    criterion,
    device
):

    model.eval()

    running_loss = 0.0

    with torch.no_grad():

        for images, masks in loader:

            images = images.to(device)
            masks = masks.to(device)

            logits = model(images)

            loss = criterion(
                logits,
                masks
            )

            running_loss += (
                loss.item() * images.size(0)
            )

    epoch_loss = (
        running_loss / len(loader.dataset)
    )

    return epoch_loss


# ============================================================
# Main
# ============================================================

def main():

    print("=" * 70)
    print("PetroVision - U-Net Pilot Training")
    print("=" * 70)

    print("\nDevice:", DEVICE)

    print("\nConfiguration:")
    print("Image size:", IMAGE_SIZE)
    print("Batch size:", BATCH_SIZE)
    print("Epochs:", EPOCHS)
    print("Learning rate:", LEARNING_RATE)

    # --------------------------------------------------------
    # Training dataset
    # --------------------------------------------------------

    train_dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="train",
        image_size=IMAGE_SIZE,
        augment=True,
    )

    # --------------------------------------------------------
    # Validation dataset
    # --------------------------------------------------------

    valid_dataset = LADOSDataset(
        root_dir=DATASET_ROOT,
        split="valid",
        image_size=IMAGE_SIZE,
        augment=False,
    )

    print("\nDataset:")
    print("Training:", len(train_dataset))
    print("Validation:", len(valid_dataset))

    # --------------------------------------------------------
    # DataLoaders
    # --------------------------------------------------------

    train_loader = DataLoader(
        train_dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=0,
    )

    valid_loader = DataLoader(
        valid_dataset,
        batch_size=BATCH_SIZE,
        shuffle=False,
        num_workers=0,
    )

    print("\nBatches:")
    print("Training:", len(train_loader))
    print("Validation:", len(valid_loader))

    # --------------------------------------------------------
    # Model
    # --------------------------------------------------------

    model = UNet(
        in_channels=3,
        out_channels=1
    ).to(DEVICE)

    parameter_count = sum(
        p.numel()
        for p in model.parameters()
        if p.requires_grad
    )

    print(
        "\nTrainable parameters:",
        f"{parameter_count:,}"
    )

    # --------------------------------------------------------
    # Loss
    # --------------------------------------------------------

    criterion = BCEDiceLoss(
        bce_weight=0.5,
        dice_weight=0.5
    )

    # --------------------------------------------------------
    # Optimizer
    # --------------------------------------------------------

    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=LEARNING_RATE
    )

    # --------------------------------------------------------
    # Best model tracking
    # --------------------------------------------------------

    best_validation_loss = float("inf")

    best_model_path = (
        MODEL_DIR
        / "unet_pilot_best.pt"
    )

    # --------------------------------------------------------
    # Training loop
    # --------------------------------------------------------

    history = []

    for epoch in range(
        1,
        EPOCHS + 1
    ):

        print(
            f"\nEpoch {epoch}/{EPOCHS}"
        )

        train_loss = train_one_epoch(
            model,
            train_loader,
            criterion,
            optimizer,
            DEVICE
        )

        validation_loss = validate(
            model,
            valid_loader,
            criterion,
            DEVICE
        )

        history.append(
            (
                epoch,
                train_loss,
                validation_loss
            )
        )

        print(
            f"Train Loss: {train_loss:.6f}"
        )

        print(
            f"Validation Loss: "
            f"{validation_loss:.6f}"
        )

        # ----------------------------------------------------
        # Save best validation model
        # ----------------------------------------------------

        if validation_loss < best_validation_loss:

            best_validation_loss = validation_loss

            torch.save(
                {
                    "epoch": epoch,
                    "model_state_dict": model.state_dict(),
                    "optimizer_state_dict": optimizer.state_dict(),
                    "validation_loss": validation_loss,
                    "image_size": IMAGE_SIZE,
                    "parameter_count": parameter_count,
                },
                best_model_path
            )

            print(
                "✓ Best model saved."
            )

    # --------------------------------------------------------
    # Summary
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print("PILOT TRAINING COMPLETE")
    print("=" * 70)

    print(
        "\nBest validation loss:",
        f"{best_validation_loss:.6f}"
    )

    print(
        "\nBest model:",
        best_model_path
    )

    print("\nTraining history:")

    print(
        "\nEpoch | Train Loss | Validation Loss"
    )

    print(
        "-" * 45
    )

    for epoch, train_loss, validation_loss in history:

        print(
            f"{epoch:5d} | "
            f"{train_loss:10.6f} | "
            f"{validation_loss:15.6f}"
        )


if __name__ == "__main__":
    main()