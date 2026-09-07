#!/usr/bin/env python3
"""
segmentation.py

Plate Segmentation and Geometric Localization Module
Part of the Night-Time Number Plate Recognition System.

Key Techniques:
- Edge-based segmentation using Canny edge detector with dynamic thresholds.
- Robust adaptive thresholding and morphological Top-Hat/Black-Hat transforms.
- Rectangular morphological operations (closing/dilation) to fuse character clusters.
- Contour filtering by aspect ratio (2.0 to 5.5), rectangularity, and area.
- 4-Point perspective transformation to rectify skewed/tilted plates into canonical flat crops.
"""

import cv2
import numpy as np
from typing import List, Tuple, Optional, Dict


def order_points(pts: np.ndarray) -> np.ndarray:
    """
    Orders 4 polygon corner points in canonical order:
    [top-left, top-right, bottom-right, bottom-left].
    """
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left has smallest sum
    rect[2] = pts[np.argmax(s)]  # bottom-right has largest sum

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right has smallest diff
    rect[3] = pts[np.argmax(diff)]  # bottom-left has largest diff
    return rect


def four_point_transform(image: np.ndarray, pts: np.ndarray, target_h: int = 80, target_w: int = 280) -> np.ndarray:
    """
    Applies 4-point perspective transformation to align and rectify the license plate.
    Removes skew, rotation, and slant.
    """
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    # Calculate width of new image
    width_a = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    width_b = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    max_w = max(int(max(width_a, width_b)), target_w)

    # Calculate height of new image
    height_a = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    height_b = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    max_h = max(int(max(height_a, height_b)), target_h)

    # Enforce standard plate aspect ratio bounds if requested
    dst = np.array([
        [0, 0],
        [max_w - 1, 0],
        [max_w - 1, max_h - 1],
        [0, max_h - 1]
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (max_w, max_h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return warped


def compute_edge_mask(gray: np.ndarray) -> np.ndarray:
    """
    Edge-based segmentation using Canny with Otsu-guided dynamic thresholds.
    """
    high_thresh, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    low_thresh = 0.5 * high_thresh
    edges = cv2.Canny(gray, max(20, int(low_thresh)), max(60, int(high_thresh)))
    return edges


def compute_adaptive_threshold_mask(gray: np.ndarray) -> np.ndarray:
    """
    Robust adaptive thresholding combined with Top-Hat & Black-Hat morphology
    to isolate high-frequency plate character textures from varying night lighting.
    """
    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, rect_kernel)
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, rect_kernel)
    combined = cv2.add(cv2.subtract(gray, blackhat), tophat)

    # Adaptive Gaussian threshold
    thresh = cv2.adaptiveThreshold(
        combined, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 19, 7
    )
    return thresh


def locate_plate_candidates(
    enhanced_img: np.ndarray,
    original_img: np.ndarray = None,
    min_area: int = 350,
    max_area: int = 250000,
    min_aspect: float = 1.4,
    max_aspect: float = 8.5
) -> List[Dict]:
    """
    Plate Localization using morphological operations and contour analysis:
    1. Grayscale conversion.
    2. Edge detection + Adaptive morphological gradient.
    3. Rectangular closing kernel to fuse alphanumeric characters into unified plate block.
    4. Contour detection and aspect ratio filtering.
    5. Perspective transformation for tilted/skewed candidates.
    """
    if enhanced_img is None or enhanced_img.size == 0:
        return []

    source_for_crop = original_img if original_img is not None else enhanced_img
    h_img, w_img = enhanced_img.shape[:2]

    gray = cv2.cvtColor(enhanced_img, cv2.COLOR_BGR2GRAY) if len(enhanced_img.shape) == 3 else enhanced_img.copy()

    # Step 1: Edge mask & adaptive threshold
    edges = compute_edge_mask(gray)
    thresh = compute_adaptive_threshold_mask(gray)

    # Step 2: Morphological horizontal gradient (Sobel-X) to find vertical character strokes
    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=-1)
    grad_x = np.absolute(grad_x)
    (min_val, max_val) = (np.min(grad_x), np.max(grad_x))
    grad_scaled = (255 * ((grad_x - min_val) / max(1e-5, (max_val - min_val)))).astype("uint8")

    # Combine edge signals
    fused_edges = cv2.bitwise_or(edges, cv2.bitwise_and(thresh, grad_scaled))

    # Step 3: Morphological closing with horizontal rectangular kernel
    # Connects individual letters and numbers into a single solid rectangular license plate candidate
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 5))
    closed = cv2.morphologyEx(fused_edges, cv2.MORPH_CLOSE, kernel_close)

    # Clean isolated noise
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    cleaned = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open)
    dilated = cv2.dilate(cleaned, cv2.getStructuringElement(cv2.MORPH_RECT, (7, 3)), iterations=1)

    # Step 4: Find contours
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    candidates = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        # Check bounding rectangle & rotated rectangle
        x, y, w, h = cv2.boundingRect(cnt)
        aspect = float(w) / float(max(1, h))

        if not (min_aspect <= aspect <= max_aspect):
            continue

        # Rectangularity check: contour area / bounding box area
        rect_area = w * h
        solidity = area / float(max(1, rect_area))
        if solidity < 0.25:
            continue

        # Polygon approximation to check for 4-corner perspective warp
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.035 * peri, True)

        rectified_crop = None
        polygon_pts = None

        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype("float32")
            polygon_pts = pts
            try:
                rectified_crop = four_point_transform(source_for_crop, pts)
            except Exception:
                rectified_crop = None

        # If not 4 corners or warp failed, extract via minAreaRect or upright box with padding
        if rectified_crop is None or rectified_crop.size == 0:
            pad_x = int(w * 0.08)
            pad_y = int(h * 0.12)
            px1, py1 = max(0, x - pad_x), max(0, y - pad_y)
            px2, py2 = min(w_img, x + w + pad_x), min(h_img, y + h + pad_y)
            rectified_crop = source_for_crop[py1:py2, px1:px2]

        if rectified_crop is None or rectified_crop.size == 0:
            continue

        # Score candidate based on centrality, prominence, and solidity
        prominence = float(area * (solidity ** 1.2))

        candidates.append({
            "box": (int(x), int(y), int(w), int(h)),
            "polygon": polygon_pts.tolist() if polygon_pts is not None else None,
            "aspect": round(aspect, 2),
            "area": int(area),
            "solidity": round(solidity, 2),
            "prominence": prominence,
            "plate_crop": rectified_crop
        })

    # Sort descending by candidate prominence score
    candidates.sort(key=lambda c: c["prominence"], reverse=True)
    return candidates


if __name__ == "__main__":
    print("[SEGMENTATION] Testing plate segmentation and localization...")
    # Synthetic test plate
    test_scene = np.zeros((300, 600, 3), dtype=np.uint8)
    cv2.rectangle(test_scene, (150, 100), (350, 160), (230, 230, 230), -1)
    cv2.putText(test_scene, "GJ01AB1234", (160, 142), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (20, 20, 20), 2)
    cands = locate_plate_candidates(test_scene)
    print(f"[SEGMENTATION] Found {len(cands)} plate candidate(s). Top box: {cands[0]['box'] if cands else 'None'}")
