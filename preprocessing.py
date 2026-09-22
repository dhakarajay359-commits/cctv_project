#!/usr/bin/env python3
"""
preprocessing.py

Night-Time Low-Light Image Enhancement Module
Part of the Night-Time Number Plate Recognition System.

Key Techniques:
- Dynamic Gamma Correction: Boosts pixel visibility in deeply shadowed/underexposed night regions.
- Contrast Limited Adaptive Histogram Equalization (CLAHE): Enhances local contrast in luminance (L-channel) without amplifying background noise.
- Bilateral Filtering: Suppresses high-ISO sensor grain noise while crisply preserving character edges.
- Highlight Compensation (HLC): Suppresses severe vehicle headlight / retroreflective plate glare.
"""

import cv2
import numpy as np


def apply_gamma_correction(image: np.ndarray, gamma: float = None) -> np.ndarray:
    """
    Applies non-linear gamma correction.
    If gamma is None, dynamically estimates optimal gamma based on frame luminance.
    Gamma < 1.0 brightens shadows; Gamma > 1.0 compresses highlights.
    """
    if image is None or image.size == 0:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    mean_val = float(np.mean(gray))

    # Adaptive gamma calculation for night-time low-light conditions
    if gamma is None:
        if mean_val < 35:
            gamma = 0.45  # Extremely dark night
        elif mean_val < 70:
            gamma = 0.60  # Moderately dark
        elif mean_val < 110:
            gamma = 0.80  # Dim twilight / street-lit
        elif mean_val > 180:
            gamma = 1.25  # High-glare wash out
        else:
            gamma = 1.0   # Well-balanced

    inv_gamma = 1.0 / max(0.1, gamma)
    table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(image, table)


def apply_clahe(image: np.ndarray, clip_limit: float = 3.0, tile_grid_size: tuple = (8, 8)) -> np.ndarray:
    """
    Applies Contrast Limited Adaptive Histogram Equalization (CLAHE).
    Operates in the CIE L*a*b* color space on the Luminance (L*) channel to avoid color distortion.
    """
    if image is None or image.size == 0:
        return image

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)

    if len(image.shape) == 3:
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l_clahe = clahe.apply(l)
        lab_enhanced = cv2.merge((l_clahe, a, b))
        return cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
    else:
        return clahe.apply(image)


def apply_highlight_compensation(image: np.ndarray, threshold: int = 230) -> np.ndarray:
    """
    Highlight Compensation (HLC) for attenuating intense headlight beams and retroreflective plate glare.
    Blends saturated regions with localized local median illumination.
    """
    if image is None or image.size == 0:
        return image

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    _, glare_mask = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)

    if np.count_nonzero(glare_mask) == 0:
        return image

    dilated_glare = cv2.dilate(glare_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    soft_glare = cv2.GaussianBlur(dilated_glare, (15, 15), 0) / 255.0

    if len(image.shape) == 3:
        soft_glare = soft_glare[:, :, np.newaxis]

    median_filtered = cv2.medianBlur(image, 5)
    compensated = (image * (1.0 - soft_glare * 0.45) + median_filtered * (soft_glare * 0.45)).astype(np.uint8)
    return compensated


def apply_night_denoising(image: np.ndarray, d: int = 7, sigma_color: float = 50.0, sigma_space: float = 50.0) -> np.ndarray:
    """
    Bilateral filter: cleans night-time sensor thermal noise while maintaining sharp character boundaries.
    """
    if image is None or image.size == 0:
        return image
    return cv2.bilateralFilter(image, d=d, sigmaColor=sigma_color, sigmaSpace=sigma_space)


def preprocess_night_image(image: np.ndarray, dynamic_gamma: bool = True, clip_limit: float = 2.8) -> np.ndarray:
    """
    Consolidated low-light image enhancement pipeline:
    1. Highlight compensation (glare suppression)
    2. Adaptive Gamma Correction (luminance expansion)
    3. CLAHE (local edge/contrast enhancement)
    4. Bilateral edge-preserving denoising
    """
    if image is None or image.size == 0:
        return image

    step1 = apply_highlight_compensation(image)
    step2 = apply_gamma_correction(step1, gamma=None if dynamic_gamma else 0.65)
    step3 = apply_clahe(step2, clip_limit=clip_limit, tile_grid_size=(8, 8))
    step4 = apply_night_denoising(step3, d=5, sigma_color=35.0, sigma_space=35.0)
    return step4


if __name__ == "__main__":
    print("[PREPROCESSING] Testing low-light image enhancement module...")
    dummy = np.full((200, 400, 3), 25, dtype=np.uint8)  # Dark scene
    cv2.putText(dummy, "NIGHT ANPR", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (180, 180, 180), 2)
    enhanced = preprocess_night_image(dummy)
    mean_in = np.mean(dummy)
    mean_out = np.mean(enhanced)
    print(f"[PREPROCESSING] Success: Input mean {mean_in:.1f} -> Enhanced mean {mean_out:.1f}")
