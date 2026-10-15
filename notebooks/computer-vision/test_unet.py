from pathlib import Path

import torch

from src.vision.unet import UNet


PROJECT_ROOT = Path(r"C:\PetroVision")


def count_parameters(model):

    return sum(
        parameter.numel()
        for parameter in model.parameters()
        if parameter.requires_grad
    )


def main():

    print("=" * 60)
    print("PetroVision - U-Net Architecture Test")
    print("=" * 60)

    # --------------------------------------------------------
    # Create model
    # --------------------------------------------------------

    model = UNet(
        in_channels=3,
        out_channels=1
    )

    print("\nModel created successfully.")

    # --------------------------------------------------------
    # Parameter count
    # --------------------------------------------------------

    parameters = count_parameters(model)

    print(
        f"Trainable parameters: {parameters:,}"
    )

    # --------------------------------------------------------
    # Test input
    #
    # Same shape produced by our DataLoader
    # --------------------------------------------------------

    batch_size = 2

    x = torch.randn(
        batch_size,
        3,
        256,
        256
    )

    print("\nInput shape:")
    print(x.shape)

    # --------------------------------------------------------
    # Forward pass
    # --------------------------------------------------------

    model.eval()

    with torch.no_grad():

        output = model(x)

    print("\nOutput shape:")
    print(output.shape)

    # --------------------------------------------------------
    # Expected shape
    # --------------------------------------------------------

    expected_shape = (
        batch_size,
        1,
        256,
        256
    )

    assert output.shape == expected_shape

    # --------------------------------------------------------
    # Check output is finite
    # --------------------------------------------------------

    assert torch.isfinite(
        output
    ).all()

    # --------------------------------------------------------
    # Check gradients / model structure
    # --------------------------------------------------------

    assert parameters > 0

    print("\nOutput minimum:")
    print(output.min().item())

    print("\nOutput maximum:")
    print(output.max().item())

    print("\n" + "=" * 60)
    print("U-NET ARCHITECTURE TEST PASSED")
    print("=" * 60)


if __name__ == "__main__":
    main()