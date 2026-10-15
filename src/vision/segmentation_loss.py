import torch
import torch.nn as nn


# ============================================================
# PetroVision - Segmentation Loss
# BCE + Dice Loss
# ============================================================


class DiceLoss(nn.Module):
    """
    Dice loss for binary segmentation.

    Dice coefficient:

        Dice = 2 * intersection / (prediction + target)

    Dice loss:

        Dice Loss = 1 - Dice
    """

    def __init__(self, smooth=1.0):

        super().__init__()

        self.smooth = smooth

    def forward(self, logits, targets):

        # Convert logits to probabilities
        probabilities = torch.sigmoid(logits)

        # Flatten each sample
        probabilities = probabilities.view(
            probabilities.size(0),
            -1
        )

        targets = targets.view(
            targets.size(0),
            -1
        )

        # Intersection
        intersection = (
            probabilities * targets
        ).sum(dim=1)

        # Dice coefficient
        dice = (
            2.0 * intersection
            + self.smooth
        ) / (
            probabilities.sum(dim=1)
            + targets.sum(dim=1)
            + self.smooth
        )

        # Average over batch
        dice = dice.mean()

        return 1.0 - dice


class BCEDiceLoss(nn.Module):
    """
    Combined Binary Cross-Entropy + Dice Loss.

    BCE operates directly on logits using
    BCEWithLogitsLoss.

    Dice loss internally applies sigmoid.
    """

    def __init__(
        self,
        bce_weight=0.5,
        dice_weight=0.5,
        smooth=1.0
    ):

        super().__init__()

        self.bce_weight = bce_weight
        self.dice_weight = dice_weight

        self.bce = nn.BCEWithLogitsLoss()

        self.dice = DiceLoss(
            smooth=smooth
        )

    def forward(self, logits, targets):

        bce_loss = self.bce(
            logits,
            targets
        )

        dice_loss = self.dice(
            logits,
            targets
        )

        total_loss = (
            self.bce_weight * bce_loss
            + self.dice_weight * dice_loss
        )

        return total_loss