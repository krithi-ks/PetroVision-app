import torch

from src.vision.segmentation_loss import (
    DiceLoss,
    BCEDiceLoss
)


def main():

    print("=" * 60)
    print("PetroVision - Segmentation Loss Test")
    print("=" * 60)

    batch_size = 2
    height = 256
    width = 256

    # --------------------------------------------------------
    # Fake model logits
    # --------------------------------------------------------

    logits = torch.randn(
        batch_size,
        1,
        height,
        width,
        requires_grad=True
    )

    # --------------------------------------------------------
    # Fake binary segmentation masks
    # --------------------------------------------------------

    targets = torch.randint(
        0,
        2,
        (
            batch_size,
            1,
            height,
            width
        )
    ).float()

    print("\nLogits shape:")
    print(logits.shape)

    print("\nTarget shape:")
    print(targets.shape)

    print("\nTarget values:")
    print(torch.unique(targets).tolist())

    # --------------------------------------------------------
    # Dice Loss
    # --------------------------------------------------------

    dice_loss = DiceLoss()

    dice_value = dice_loss(
        logits,
        targets
    )

    print("\nDice Loss:")
    print(dice_value.item())

    # --------------------------------------------------------
    # Combined loss
    # --------------------------------------------------------

    criterion = BCEDiceLoss(
        bce_weight=0.5,
        dice_weight=0.5
    )

    total_loss = criterion(
        logits,
        targets
    )

    print("\nBCE + Dice Loss:")
    print(total_loss.item())

    # --------------------------------------------------------
    # Verify gradients
    # --------------------------------------------------------

    total_loss.backward()

    print("\nGradient check:")

    print(
        "Gradient exists:",
        logits.grad is not None
    )

    print(
        "Gradient finite:",
        torch.isfinite(
            logits.grad
        ).all().item()
    )

    # --------------------------------------------------------
    # Assertions
    # --------------------------------------------------------

    assert dice_value.ndim == 0
    assert torch.isfinite(dice_value)

    assert total_loss.ndim == 0
    assert torch.isfinite(total_loss)

    assert logits.grad is not None
    assert torch.isfinite(
        logits.grad
    ).all()

    print("\n" + "=" * 60)
    print("SEGMENTATION LOSS TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()