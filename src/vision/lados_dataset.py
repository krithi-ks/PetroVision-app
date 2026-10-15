from pathlib import Path
import random

import numpy as np
import torch
from PIL import Image, ImageEnhance
from torch.utils.data import Dataset


# ============================================================
# PetroVision - LADOS Dataset
# ============================================================

PETROLEUM_CLASSES = {
    1,  # Emulsion
    2,  # Oil
    4,  # Sheen
}

VALID_CLASS_IDS = {
    0,  # Background
    1,  # Emulsion
    2,  # Oil
    3,  # Oil-platform
    4,  # Sheen
    5,  # Ship
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
}


class LADOSDataset(Dataset):

    def __init__(
        self,
        root_dir,
        split="train",
        image_size=(256, 256),
        augment=False,
    ):

        self.root_dir = Path(root_dir)
        self.split = split
        if isinstance(image_size, int):
            self.image_size = (image_size, image_size)
        else:
            self.image_size = tuple(image_size)
        self.augment = augment and split == "train"

        if split not in {"train", "valid", "test"}:
            raise ValueError(
                "split must be 'train', 'valid', or 'test'"
            )

        self.split_dir = self.root_dir / split

        if not self.split_dir.exists():
            raise FileNotFoundError(
                f"Split directory not found: {self.split_dir}"
            )

        self.image_paths = sorted(
            [
                path
                for path in self.split_dir.iterdir()
                if (
                    path.is_file()
                    and path.suffix.lower() in IMAGE_EXTENSIONS
                    and not path.name.endswith("_mask.png")
                )
            ]
        )

        if len(self.image_paths) == 0:
            raise RuntimeError(
                f"No images found in {self.split_dir}"
            )

        # Verify that every image has a corresponding mask
        for image_path in self.image_paths:

            mask_path = image_path.with_name(
                image_path.stem + "_mask.png"
            )

            if not mask_path.exists():
                raise FileNotFoundError(
                    f"Mask not found for: {image_path.name}"
                )

    def __len__(self):
        return len(self.image_paths)

    def _apply_augmentation(self, image, mask):
        """
        Apply training augmentation.

        Geometric transformations:
            - Horizontal flip
            - Vertical flip
            - Small rotation

        Photometric transformations:
            - Brightness
            - Contrast

        Geometric transformations affect both image and mask.
        Photometric transformations affect image only.
        """

        # ----------------------------------------------------
        # Horizontal flip
        # ----------------------------------------------------

        if random.random() < 0.5:

            image = image.transpose(
                Image.Transpose.FLIP_LEFT_RIGHT
            )

            mask = mask.transpose(
                Image.Transpose.FLIP_LEFT_RIGHT
            )

        # ----------------------------------------------------
        # Vertical flip
        # ----------------------------------------------------

        if random.random() < 0.5:

            image = image.transpose(
                Image.Transpose.FLIP_TOP_BOTTOM
            )

            mask = mask.transpose(
                Image.Transpose.FLIP_TOP_BOTTOM
            )

        # ----------------------------------------------------
        # Small random rotation
        # ----------------------------------------------------

        if random.random() < 0.5:

            angle = random.uniform(
                -8.0,
                8.0
            )

            image = image.rotate(
                angle,
                resample=Image.Resampling.BILINEAR,
                expand=False
            )

            mask = mask.rotate(
                angle,
                resample=Image.Resampling.NEAREST,
                expand=False
            )

        # ----------------------------------------------------
        # Brightness
        # Image only
        # ----------------------------------------------------

        if random.random() < 0.5:

            brightness_factor = random.uniform(
                0.90,
                1.10
            )

            image = ImageEnhance.Brightness(
                image
            ).enhance(
                brightness_factor
            )

        # ----------------------------------------------------
        # Contrast
        # Image only
        # ----------------------------------------------------

        if random.random() < 0.5:

            contrast_factor = random.uniform(
                0.90,
                1.10
            )

            image = ImageEnhance.Contrast(
                image
            ).enhance(
                contrast_factor
            )

        return image, mask

    def __getitem__(self, index):

        image_path = self.image_paths[index]

        mask_path = image_path.with_name(
            image_path.stem + "_mask.png"
        )

        # ----------------------------------------------------
        # Load
        # ----------------------------------------------------

        image = Image.open(
            image_path
        ).convert("RGB")

        mask = Image.open(
            mask_path
        ).convert("L")

        # ----------------------------------------------------
        # Resize
        #
        # Image -> bilinear
        # Mask  -> nearest-neighbor
        # ----------------------------------------------------

        image = image.resize(
            self.image_size,
            Image.Resampling.BILINEAR
        )

        mask = mask.resize(
            self.image_size,
            Image.Resampling.NEAREST
        )

        # ----------------------------------------------------
        # Validate original LADOS class IDs
        # ----------------------------------------------------

        mask_array = np.asarray(
            mask,
            dtype=np.uint8
        )

        unique_classes = set(
            np.unique(mask_array).tolist()
        )

        invalid_classes = (
            unique_classes - VALID_CLASS_IDS
        )

        if invalid_classes:

            raise ValueError(
                f"Unexpected mask classes "
                f"{invalid_classes} in {mask_path.name}"
            )

        # ----------------------------------------------------
        # Training augmentation
        # ----------------------------------------------------

        if self.augment:

            image, mask = self._apply_augmentation(
                image,
                mask
            )

        # ----------------------------------------------------
        # Convert image to float32 [0, 1]
        # ----------------------------------------------------

        image_array = np.asarray(
            image,
            dtype=np.float32
        ) / 255.0

        # ----------------------------------------------------
        # Convert mask
        # ----------------------------------------------------

        mask_array = np.asarray(
            mask,
            dtype=np.uint8
        )

        # ----------------------------------------------------
        # Convert multiclass LADOS mask into binary
        # petroleum-related target mask
        #
        # 1 = Emulsion
        # 2 = Oil
        # 4 = Sheen
        #
        # Everything else = 0
        # ----------------------------------------------------

        binary_mask = np.isin(
            mask_array,
            list(PETROLEUM_CLASSES)
        ).astype(np.float32)

        # ----------------------------------------------------
        # HWC -> CHW
        # ----------------------------------------------------

        image_tensor = torch.from_numpy(
            image_array
        ).permute(
            2,
            0,
            1
        ).float()

        # ----------------------------------------------------
        # Add mask channel
        # ----------------------------------------------------

        mask_tensor = torch.from_numpy(
            binary_mask
        ).unsqueeze(
            0
        ).float()

        return image_tensor, mask_tensor