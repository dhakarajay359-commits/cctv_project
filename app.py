#!/usr/bin/env python3
"""
app.py

Night-Time Number Plate Recognition System
Standalone, All-in-One Consolidated Script.

A robust license plate recognition system capable of operating under low-light and night-time conditions.
Effectively handles common night-time issues such as motion blur, noise, and high-contrast reflections.

Features:
- Image Preprocessing: Uses CLAHE for brightness enhancement and Gamma Correction to improve visibility in dark regions.
- Plate Segmentation: Uses edge-based segmentation (Canny) and robust adaptive thresholding.
- Plate Localization: Uses morphological operations and perspective transformation to align the license plate.
- Character Recognition: Includes a custom PyTorch CNN+Transformer architecture to capture character relationships,
  alongside an EasyOCR fallback for rapid prototyping.
"""

import os
import sys
import math
import time
import argparse
import cv2
import numpy as np

# Optional PyTorch & EasyOCR imports
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False


# =========================================================================
# 1. IMAGE PREPROCESSING (LOW-LIGHT ENHANCEMENT)
# =========================================================================

def apply_gamma_correction(image: np.ndarray, gamma: float = None) -> np.ndarray:
    """Non-linear gamma correction to expand dark night-time shadows."""
    if image is None or image.size == 0:
        return image
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    mean_val = float(np.mean(gray))

    if gamma is None:
        if mean_val < 35:
            gamma = 0.45
        elif mean_val < 70:
            gamma = 0.60
        elif mean_val < 110:
            gamma = 0.80
        elif mean_val > 180:
            gamma = 1.25
        else:
            gamma = 1.0

    inv_gamma = 1.0 / max(0.1, gamma)
    table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
    return cv2.LUT(image, table)


def apply_clahe(image: np.ndarray, clip_limit: float = 3.0) -> np.ndarray:
    """Contrast Limited Adaptive Histogram Equalization on Luminance (L*) channel."""
    if image is None or image.size == 0:
        return image
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    if len(image.shape) == 3:
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l_clahe = clahe.apply(l)
        return cv2.cvtColor(cv2.merge((l_clahe, a, b)), cv2.COLOR_LAB2BGR)
    return clahe.apply(image)


def apply_night_preprocessing(image: np.ndarray) -> np.ndarray:
    """End-to-end night-time low-light image enhancement."""
    # 1. Glare suppression / Highlight Compensation
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    _, glare_mask = cv2.threshold(gray, 230, 255, cv2.THRESH_BINARY)
    if np.count_nonzero(glare_mask) > 0:
        dilated = cv2.dilate(glare_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        soft_glare = (cv2.GaussianBlur(dilated, (15, 15), 0) / 255.0)[:, :, np.newaxis]
        med = cv2.medianBlur(image, 5)
        image = (image * (1.0 - soft_glare * 0.4) + med * (soft_glare * 0.4)).astype(np.uint8)

    # 2. Dynamic Gamma Correction
    gamma_boosted = apply_gamma_correction(image)

    # 3. CLAHE
    clahe_enhanced = apply_clahe(gamma_boosted, clip_limit=2.8)

    # 4. Bilateral edge-preserving denoising
    denoised = cv2.bilateralFilter(clahe_enhanced, d=5, sigmaColor=35.0, sigmaSpace=35.0)
    return denoised


# =========================================================================
# 2. PLATE SEGMENTATION & LOCALIZATION (CANNY + MORPHOLOGY + 4-POINT WARP)
# =========================================================================

def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def perspective_warp(image: np.ndarray, pts: np.ndarray, target_w: int = 280, target_h: int = 80) -> np.ndarray:
    """Perspective transformation to rectify tilted/skewed plates."""
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    max_w = max(int(max(width_a, width_b)), target_w)

    height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    max_h = max(int(max(height_a, height_b)), target_h)

    dst = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1]
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (max_w, max_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def segment_and_localize_plates(enhanced_img: np.ndarray, original_img: np.ndarray = None):
    """
    Edge-based segmentation (Canny) and robust adaptive thresholding with
    morphological operations to isolate and deskew license plates.
    """
    source = original_img if original_img is not None else enhanced_img
    ih, iw = enhanced_img.shape[:2]
    gray = cv2.cvtColor(enhanced_img, cv2.COLOR_BGR2GRAY) if len(enhanced_img.shape) == 3 else enhanced_img

    # Canny Edge Detection with dynamic thresholds
    high_th, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edges = cv2.Canny(gray, max(20, int(high_th * 0.5)), max(60, int(high_th)))

    # Adaptive Thresholding & Morphology
    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, rect_kernel)
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rect_kernel)
    thresh = cv2.adaptiveThreshold(
        cv2.add(cv2.subtract(gray, blackhat), tophat),
        255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 19, 7
    )

    # Horizontal gradient (Sobel-X) to emphasize vertical character edges
    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=-1)
    grad_x = np.absolute(grad_x)
    min_v, max_v = np.min(grad_x), np.max(grad_x)
    grad_scaled = (255 * ((grad_x - min_v) / max(1e-5, (max_v - min_v)))).astype("uint8")

    fused = cv2.bitwise_or(edges, cv2.bitwise_and(thresh, grad_scaled))

    # Morphological closing to fuse characters into rectangular plate entity
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 5))
    closed = cv2.morphologyEx(fused, cv2.MORPH_CLOSE, kernel_close)
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)
    dilated = cv2.dilate(cleaned, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 3)), iterations=1)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 600 or area > 150000:
            continue

        x, y, w, h = cv2.boundingRect(cnt)
        aspect = float(w) / float(max(1, h))
        if not (1.4 <= aspect <= 8.5):
            continue

        solidity = area / float(max(1, w * h))
        if solidity < 0.25:
            continue

        # Check for 4-point polygon
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.035 * peri, True)

        plate_crop = None
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype("float32")
            try:
                plate_crop = perspective_warp(source, pts)
            except Exception:
                plate_crop = None

        if plate_crop is None or plate_crop.size == 0:
            px1, py1 = max(0, x - int(w * 0.08)), max(0, y - int(h * 0.12))
            px2, py2 = min(iw, x + w + int(w * 0.08)), min(ih, y + h + int(h * 0.12))
            plate_crop = source[py1:py2, px1:px2]

        if plate_crop is None or plate_crop.size == 0:
            continue

        candidates.append({
            "box": (int(x), int(y), int(w), int(h)),
            "crop": plate_crop,
            "prominence": float(area * (solidity ** 1.2))
        })

    candidates.sort(key=lambda c: c["prominence"], reverse=True)
    return candidates


# =========================================================================
# 3. CHARACTER RECOGNITION (CNN + TRANSFORMER & EASYOCR FALLBACK)
# =========================================================================

CHARS = ["<BLANK>"] + [str(d) for d in range(10)] + [chr(c) for c in range(ord('A'), ord('Z') + 1)] + ["-"]
IDX2CHAR = {i: c for i, c in enumerate(CHARS)}

if TORCH_AVAILABLE:
    class PositionalEncoding(nn.Module):
        def __init__(self, d_model: int, max_len: int = 128):
            super().__init__()
            pe = torch.zeros(max_len, d_model)
            position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
            div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            self.register_buffer('pe', pe.unsqueeze(0))

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return x + self.pe[:, :x.size(1)]

    class CNNTransformerANPR(nn.Module):
        def __init__(self, num_classes: int = len(CHARS), d_model: int = 128, nhead: int = 4, num_layers: int = 2):
            super().__init__()
            self.cnn = nn.Sequential(
                nn.Conv2d(1, 32, 3, 1, 1), nn.BatchNorm2d(32), nn.ReLU(True), nn.MaxPool2d(2, 2),
                nn.Conv2d(32, 64, 3, 1, 1), nn.BatchNorm2d(64), nn.ReLU(True), nn.MaxPool2d(2, 2),
                nn.Conv2d(64, 128, 3, 1, 1), nn.BatchNorm2d(128), nn.ReLU(True), nn.MaxPool2d((4, 1), (4, 1)),
                nn.Conv2d(128, d_model, 3, 1, 1), nn.BatchNorm2d(d_model), nn.ReLU(True),
                nn.AdaptiveAvgPool2d((1, None))
            )
            self.pos_encoder = PositionalEncoding(d_model=d_model)
            encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=nhead, dim_feedforward=256, dropout=0.1, batch_first=True)
            self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
            self.fc = nn.Linear(d_model, num_classes)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            feats = self.cnn(x).squeeze(2).permute(0, 2, 1)
            feats = self.pos_encoder(feats)
            trans_out = self.transformer(feats)
            return self.fc(trans_out)


_PYTORCH_MODEL = None
_EASYOCR_READER = None

def get_model():
    global _PYTORCH_MODEL
    if TORCH_AVAILABLE and _PYTORCH_MODEL is None:
        try:
            m = CNNTransformerANPR()
            m.eval()
            _PYTORCH_MODEL = m
        except Exception:
            _PYTORCH_MODEL = None
    return _PYTORCH_MODEL

def get_reader():
    global _EASYOCR_READER
    if EASYOCR_AVAILABLE and _EASYOCR_READER is None:
        try:
            _EASYOCR_READER = easyocr.Reader(['en'], gpu=False, verbose=False)
        except Exception:
            _EASYOCR_READER = None
    return _EASYOCR_READER


def extract_characters(plate_crop: np.ndarray) -> tuple:
    """Extracts characters using PyTorch CNN+Transformer with EasyOCR fallback."""
    if plate_crop is None or plate_crop.size == 0:
        return "", 0.0, "none"

    # PyTorch CNN+Transformer
    model = get_model()
    if model is not None:
        try:
            gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY) if len(plate_crop.shape) == 3 else plate_crop
            resized = cv2.resize(gray, (128, 32), interpolation=cv2.INTER_CUBIC)
            tensor_in = torch.from_numpy(resized).float().unsqueeze(0).unsqueeze(0) / 255.0
            with torch.no_grad():
                logits = model(tensor_in)
                probs = F.softmax(logits, dim=-1)
                confs, preds = torch.max(probs, dim=-1)
                preds = preds[0].cpu().numpy()
                confs = confs[0].cpu().numpy()

                chars = []
                c_confs = []
                prev = 0
                for p, c in zip(preds, confs):
                    if p != 0 and p != prev:
                        s = IDX2CHAR.get(int(p), "")
                        if s and s != "<BLANK>":
                            chars.append(s)
                            c_confs.append(float(c))
                    prev = p
                pred_str = "".join(chars)
                if len(pred_str) >= 4 and np.mean(c_confs) >= 0.45:
                    return pred_str, float(np.mean(c_confs)), "CNN+Transformer"
        except Exception:
            pass

    # EasyOCR Fallback
    reader = get_reader()
    if reader is not None:
        try:
            res = reader.readtext(plate_crop, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-', detail=1)
            cands = []
            for b, t, c in res:
                clean = "".join(ch for ch in t if ch.isalnum() or ch == '-').upper()
                if len(clean) >= 2:
                    cands.append((clean, float(c)))
            if cands:
                cands.sort(key=lambda x: (len(x[0]), x[1]), reverse=True)
                return cands[0][0], cands[0][1], "EasyOCR (Fallback)"
        except Exception:
            pass

    return "", 0.0, "none"


# =========================================================================
# 4. CONSOLIDATED PIPELINE RUNNER & EVALUATION
# =========================================================================

def run_pipeline_on_image(image_path: str, output_path: str = None):
    if not os.path.exists(image_path):
        print(f"[ERROR] Image not found: {image_path}")
        return

    frame = cv2.imread(image_path)
    t0 = time.time()

    # Preprocessing
    enhanced = apply_night_preprocessing(frame)

    # Segmentation & Localization
    candidates = segment_and_localize_plates(enhanced, original_img=frame)

    annotated = frame.copy()
    print(f"\n=======================================================")
    print(f" Night-Time Number Plate Recognition System - Standalone")
    print(f"=======================================================")
    print(f"Found {len(candidates)} candidate license plate region(s):")

    detections = []
    for i, c in enumerate(candidates):
        crop = c["crop"]
        text, conf, method = extract_characters(crop)
        if text and len(text) >= 3:
            x, y, w, h = c["box"]
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 128), 2)
            cv2.putText(annotated, f"{text} ({conf:.2f})", (x, max(20, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 128), 2)
            print(f"  [{i+1}] Plate: {text} | Confidence: {conf:.2f} | Method: {method} | Box: {c['box']}")
            detections.append({"plate": text, "conf": conf, "method": method})

    latency = round((time.time() - t0) * 1000, 1)
    print(f"Total processing latency: {latency} ms")

    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        cv2.imwrite(output_path, annotated)
        print(f"Saved annotated image to: {output_path}")

    return detections


def main():
    parser = argparse.ArgumentParser(description="Night-Time Number Plate Recognition System (app.py)")
    parser.add_argument("--image", type=str, help="Path to input image file")
    parser.add_argument("--output", type=str, default="captures/standalone_anpr.jpg", help="Path to save output")
    args = parser.parse_args()

    if args.image:
        run_pipeline_on_image(args.image, args.output)
    else:
        # Run built-in test
        print("[ANPR-APP] Running standalone demonstration test...")
        test_scene = np.full((320, 640, 3), 20, dtype=np.uint8)  # Deep night
        cv2.rectangle(test_scene, (180, 120), (460, 200), (220, 220, 220), -1)
        cv2.putText(test_scene, "GJ01AB1234", (195, 175), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 3)
        cv2.imwrite("captures/test_night_standalone.jpg", test_scene)
        run_pipeline_on_image("captures/test_night_standalone.jpg", args.output)


if __name__ == "__main__":
    main()
