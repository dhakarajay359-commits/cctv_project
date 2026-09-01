"""
ocr_preprocess.py

OCR Preprocessing for Low-Resolution / Degraded CCTV License Plates
Spec:
  - 3x Cubic Upscaling
  - HSV Yellow Mask Filtering
  - CLAHE Grayscale Contrast Enhancement
  - Otsu Binary Thresholding
"""

import cv2
import numpy as np


def preprocess_cctv_plate(crop_img):
    """
    Enhances small (15x25px to 30x40px), degraded, or glare-affected night license plates.

    Args:
        crop_img (np.ndarray): Cropped optical plate region from camera frame.

    Returns:
        binary (np.ndarray): High-contrast binarized plate image ready for Tesseract/PaddleOCR.
    """
    if crop_img is None or crop_img.size == 0:
        return None

    height, width = crop_img.shape[:2]
    # 1. Upscale 3x with bicubic interpolation
    upscaled = cv2.resize(crop_img, (width * 3, height * 3), interpolation=cv2.INTER_CUBIC)

    # 2. Extract HSV yellow mask (for commercial Indian plates)
    hsv = cv2.cvtColor(upscaled, cv2.COLOR_BGR2HSV)
    lower_yellow = np.array([15, 80, 80])
    upper_yellow = np.array([35, 255, 255])
    yellow_mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

    # 3. CLAHE on grayscale to recover washed-out characters under headlights/glare
    gray = cv2.cvtColor(upscaled, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 4. Otsu's binarization for clean, segmented character glyphs
    _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return binary
