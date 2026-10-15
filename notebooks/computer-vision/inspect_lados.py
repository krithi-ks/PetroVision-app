from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt
from PIL import Image


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

DATASET_ROOT = Path(r"C:\PetroVision\data\lados")
SPLIT = "train"

MASK_NAME = "train3-80-_jpg.rf.8034015e02783822463d32fd0adb9310_mask.png"

# LADOS class IDs verified from the exported masks
BACKGROUND = 0
EMULSION = 1
OIL = 2
OIL_PLATFORM = 3
SHEEN = 4
SHIP = 5

# First PetroVision binary task:
# visible petroleum-related liquid = Oil + Emulsion + Sheen
PETROLEUM_CLASSES = {OIL, EMULSION, SHEEN}


# ---------------------------------------------------------
# Locate image and mask
# ---------------------------------------------------------

mask_path = DATASET_ROOT / SPLIT / MASK_NAME

if not mask_path.exists():
    raise FileNotFoundError(f"Mask not found: {mask_path}")

image_name = MASK_NAME.replace("_mask.png", ".jpg")
image_path = DATASET_ROOT / SPLIT / image_name

if not image_path.exists():
    raise FileNotFoundError(f"Image not found: {image_path}")


# ---------------------------------------------------------
# Load image and mask
# ---------------------------------------------------------

image = np.array(Image.open(image_path).convert("RGB"))
mask = np.array(Image.open(mask_path))

print("Image:", image_path.name)
print("Image shape:", image.shape)

print("Mask:", mask_path.name)
print("Mask shape:", mask.shape)
print("Mask values:", np.unique(mask))


# ---------------------------------------------------------
# Create binary petroleum mask
# ---------------------------------------------------------

binary_mask = np.isin(mask, list(PETROLEUM_CLASSES)).astype(np.uint8)


# ---------------------------------------------------------
# Create overlay
# ---------------------------------------------------------

overlay = image.copy()

# Highlight petroleum-related pixels
overlay[binary_mask == 1] = (
    0.5 * overlay[binary_mask == 1]
    + 0.5 * np.array([255, 0, 0])
).astype(np.uint8)


# ---------------------------------------------------------
# Plot
# ---------------------------------------------------------

fig, axes = plt.subplots(1, 4, figsize=(20, 5))

axes[0].imshow(image)
axes[0].set_title("Original Image")

axes[1].imshow(mask, cmap="tab10", vmin=0, vmax=5)
axes[1].set_title("Original Class Mask")

axes[2].imshow(binary_mask, cmap="gray")
axes[2].set_title("Binary Petroleum Mask")

axes[3].imshow(overlay)
axes[3].set_title("Petroleum Overlay")

for ax in axes:
    ax.axis("off")

plt.tight_layout()

output_path = DATASET_ROOT / "inspection_visualization.png"
plt.savefig(output_path, dpi=150, bbox_inches="tight")
plt.show()

print(f"\nSaved visualization to: {output_path}")