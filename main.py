#!/usr/bin/env python3
"""
main.py

Modular Entry Point for Night-Time Number Plate Recognition System.
Coordinates:
1. Low-Light Preprocessing (CLAHE, Gamma Correction, HLC, Denoising)
2. Plate Segmentation & Localization (Canny, Adaptive Threshold, Morphology, 4-Point Warp)
3. Character Recognition (Custom PyTorch CNN+Transformer with EasyOCR Fallback)
4. Standard Evaluation & Metrics Reporting
"""

import os
import sys
import time
import argparse
import cv2
import numpy as np

from preprocessing import preprocess_night_image
from segmentation import locate_plate_candidates
from recognition import recognize_characters
from evaluate import compute_cer, evaluate_predictions


class NightTimeANPRPipeline:
    """
    End-to-end Night-Time Number Plate Recognition Pipeline.
    Engineered to handle severe darkness, glare, motion blur, and perspective distortion.
    """
    def __init__(self, prefer_transformer: bool = True, use_easyocr_fallback: bool = True):
        self.prefer_transformer = prefer_transformer
        self.use_easyocr_fallback = use_easyocr_fallback
        print("[ANPR-PIPELINE] Initializing Night-Time Number Plate Recognition System...")
        print("[ANPR-PIPELINE] Modules active: Preprocessing (CLAHE/Gamma) -> Segmentation (Canny/Morph) -> Recognition (CNN+Transformer/EasyOCR)")

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        Executes the full night-time ANPR pipeline on a single frame.
        """
        t0 = time.time()
        if frame is None or frame.size == 0:
            return {"status": "error", "message": "Empty frame", "detections": []}

        # Stage 1: Low-Light Image Preprocessing
        enhanced_frame = preprocess_night_image(frame, dynamic_gamma=True, clip_limit=2.8)

        # Stage 2: Plate Segmentation and Geometric Localization
        candidates = locate_plate_candidates(enhanced_frame, original_img=frame)

        annotated_frame = frame.copy()
        detections = []

        for cand in candidates:
            plate_crop = cand["plate_crop"]
            # Stage 3: Deep Character Recognition
            recog_res = recognize_characters(
                plate_crop,
                prefer_transformer=self.prefer_transformer,
                use_easyocr_fallback=self.use_easyocr_fallback
            )

            plate_text = recog_res["text"]
            conf = recog_res["confidence"]
            method = recog_res["method"]

            if not plate_text or len(plate_text) < 3:
                continue

            x, y, w, h = cand["box"]
            cv2.rectangle(annotated_frame, (x, y), (x + w, y + h), (0, 255, 128), 2)
            label = f"{plate_text} ({conf:.2f})"
            cv2.putText(
                annotated_frame, label, (x, max(20, y - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 128), 2
            )

            detections.append({
                "plate": plate_text,
                "confidence": conf,
                "method": method,
                "box": cand["box"],
                "polygon": cand.get("polygon"),
                "plate_crop": plate_crop
            })

        latency = round((time.time() - t0) * 1000, 1)

        return {
            "status": "success",
            "detections": detections,
            "latency_ms": latency,
            "annotated_frame": annotated_frame,
            "preprocessed_frame": enhanced_frame
        }

    def process_image(self, image_path: str, output_path: str = None) -> dict:
        """Runs the pipeline on a static image file."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at {image_path}")

        img = cv2.imread(image_path)
        result = self.process_frame(img)

        if output_path and result.get("annotated_frame") is not None:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            cv2.imwrite(output_path, result["annotated_frame"])
            print(f"[ANPR-PIPELINE] Saved annotated output to {output_path}")

        return result


def main():
    parser = argparse.ArgumentParser(description="Night-Time Number Plate Recognition System (Modular Entry Point)")
    parser.add_argument("--image", type=str, help="Path to input test image")
    parser.add_argument("--output", type=str, default="captures/anpr_output.jpg", help="Path to save annotated output image")
    parser.add_argument("--video", type=str, help="Path to input video file")
    parser.add_argument("--cam", type=int, help="Webcam device index (e.g. 0)")
    args = parser.parse_args()

    pipeline = NightTimeANPRPipeline()

    if args.image:
        print(f"[ANPR-PIPELINE] Processing image: {args.image}")
        res = pipeline.process_image(args.image, args.output)
        print(f"[ANPR-PIPELINE] Execution time: {res['latency_ms']} ms")
        print(f"[ANPR-PIPELINE] Detected {len(res['detections'])} plates:")
        for det in res["detections"]:
            print(f"  - Plate: '{det['plate']}', Confidence: {det['confidence']}, Method: {det['method']}")
    else:
        print("[ANPR-PIPELINE] Running self-test with synthetic night-time plate...")
        test_scene = np.full((320, 640, 3), 25, dtype=np.uint8)
        cv2.rectangle(test_scene, (180, 110), (460, 200), (220, 220, 220), -1)
        cv2.putText(test_scene, "GJ01AB1234", (195, 170), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (20, 20, 20), 3)
        res = pipeline.process_frame(test_scene)
        print(f"[ANPR-PIPELINE] Pipeline self-test complete in {res['latency_ms']} ms.")
        for det in res["detections"]:
            print(f"  - Plate: '{det['plate']}', Conf: {det['confidence']}, Method: {det['method']}")


if __name__ == "__main__":
    main()
