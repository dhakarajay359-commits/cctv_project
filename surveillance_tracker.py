#!/usr/bin/env python3
"""
surveillance_tracker.py

Production-Grade Real-Time CCTV Suspect Vehicle Tracking & Evidentiary Snapshot Engine.
Designed for State / Smart-City Integrated Command and Control Centers (ICCC).

Features:
- Multi-threaded video ingest (ThreadedVideoCapture) to eliminate frame buffer latency on RTSP/Webcam feeds.
- Real-time vehicle detection & classification via Ultralytics YOLOv8.
- Plate optical preprocessing: 3x bicubic upscaling, CLAHE contrast enhancement, bilateral denoising.
- OCR character extraction via EasyOCR with alphanumeric allowlist.
- Fuzzy matching (difflib / Levenshtein ratio) and regex/substring search against target suspect plate.
- Evidentiary capture pipeline: full frame, vehicle crop, plate crop, and CSV alert logging.
- Configurable debounce window to prevent redundant multi-frame alerts on the same suspect.
"""

import os
import sys
import csv
import time
import queue
import difflib
import argparse
import threading
from datetime import datetime

# Lazy import check helpers for friendly terminal guidance
try:
    import cv2
    import numpy as np
except ImportError:
    print("[ERROR] OpenCV / NumPy is required. Install via: pip install opencv-python numpy")
    cv2 = None
    np = None

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

try:
    import easyocr
except ImportError:
    easyocr = None


# Directory paths
CAPTURE_DIR = os.path.join("captures", "suspects")
LOG_FILE = os.path.join("captures", "suspect_alerts.csv")

# Standard COCO Vehicle Class IDs for YOLOv8
VEHICLE_CLASS_MAP = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck"
}


class ThreadedVideoCapture:
    """
    Dedicated background thread to consume frames from RTSP / WebCam feeds.
    Drops backpressure frames so the inference pipeline always processes the latest frame.
    """
    def __init__(self, src=0):
        # Handle string integer for webcam indexes like "0"
        if isinstance(src, str) and src.isdigit():
            src = int(src)
        self.src = src
        self.cap = cv2.VideoCapture(self.src)
        if not self.cap.isOpened():
            raise RuntimeError(f"Unable to open video source: {self.src}")

        # Set lower internal buffer size for RTSP streams if supported
        try:
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass

        self.grabbed, self.frame = self.cap.read()
        self.stopped = False
        self.lock = threading.Lock()

        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def _update(self):
        while not self.stopped:
            grabbed, frame = self.cap.read()
            if not grabbed:
                self.stopped = True
                break
            with self.lock:
                self.grabbed = grabbed
                self.frame = frame
            time.sleep(0.005)

    def read(self):
        with self.lock:
            return self.grabbed, self.frame

    def is_running(self):
        return not self.stopped and self.grabbed

    def release(self):
        self.stopped = True
        if self.thread.is_alive():
            self.thread.join(timeout=1.0)
        self.cap.release()


def init_alert_log():
    """Ensure directory exists and CSV log has standard header."""
    os.makedirs(CAPTURE_DIR, exist_ok=True)
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "Timestamp",
                "Camera_Source",
                "Target_Plate",
                "Detected_Text",
                "Target_Vehicle",
                "Detected_Vehicle",
                "Match_Score",
                "OCR_Confidence",
                "Vehicle_BBox_XYXY",
                "Full_Snapshot_Path",
                "Vehicle_Crop_Path",
                "Plate_Crop_Path"
            ])


def preprocess_plate(crop):
    """
    Enhance low-resolution / glare-affected license plate crops:
    - 3x Bicubic upscaling
    - Grayscale conversion
    - Contrast Limited Adaptive Histogram Equalization (CLAHE)
    - Bilateral filtering to preserve character edges while eliminating sensor noise
    """
    if crop is None or crop.size == 0:
        return None

    h, w = crop.shape[:2]
    # Resize up to enhance small glyphs
    scale = max(2, min(4, int(180 / max(h, 1))))
    resized = cv2.resize(crop, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
    
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    contrast = clahe.apply(gray)
    denoised = cv2.bilateralFilter(contrast, 9, 75, 75)
    return denoised


def clean_plate_string(raw_text):
    """Remove spaces, hyphens, and non-alphanumeric noise."""
    if not raw_text:
        return ""
    return "".join(ch for ch in raw_text.upper() if ch.isalnum())


def calculate_match_score(target_plate, detected_plate):
    """
    Calculate similarity between target and detected plate.
    Returns score between 0.0 and 1.0.
    """
    if not target_plate or not detected_plate:
        return 0.0

    target = clean_plate_string(target_plate)
    detected = clean_plate_string(detected_plate)

    # 1. Exact match
    if target == detected:
        return 1.0

    # 2. Substring match
    if target in detected or detected in target:
        ratio = len(target) / max(len(detected), len(target))
        return max(0.85, ratio)

    # 3. Fuzzy match ratio
    matcher = difflib.SequenceMatcher(None, target, detected)
    return matcher.ratio()


def extract_plate_candidate(vehicle_crop):
    """
    Heuristic plate region locator when a dedicated plate detector is not loaded:
    Extracts the lower-center 35% of the vehicle crop where license plates are mounted.
    """
    vh, vw = vehicle_crop.shape[:2]
    if vh < 40 or vw < 40:
        return vehicle_crop

    ymin = int(vh * 0.60)
    ymax = int(vh * 0.95)
    xmin = int(vw * 0.15)
    xmax = int(vw * 0.85)
    return vehicle_crop[ymin:ymax, xmin:xmax]


def run_surveillance(
    source,
    target_plate,
    target_vehicle="any",
    model_path="yolov8n.pt",
    conf_thresh=0.35,
    match_thresh=0.80,
    debounce_sec=4.0,
    headless=False
):
    """
    Main real-time surveillance loop.
    """
    if cv2 is None:
        raise SystemExit("Missing OpenCV. Install with: pip install opencv-python")
    if YOLO is None:
        raise SystemExit("Missing Ultralytics YOLO. Install with: pip install ultralytics")
    if easyocr is None:
        raise SystemExit("Missing EasyOCR. Install with: pip install easyocr")

    init_alert_log()

    target_plate_clean = clean_plate_string(target_plate)
    target_vehicle = target_vehicle.lower().strip()
    print("=" * 65)
    print(" NIRIKSHAN CCTV SUSPECT VEHICLE TRACKER")
    print("=" * 65)
    print(f" Source Camera         : {source}")
    print(f" Target License Plate  : {target_plate_clean}")
    print(f" Target Vehicle Type   : {target_vehicle}")
    print(f" Match Score Threshold : {match_thresh * 100:.0f}%")
    print(f" Frame Buffering       : Multi-Threaded Ingest Active")
    print(f" Evidentiary Directory : {os.path.abspath(CAPTURE_DIR)}")
    print("=" * 65)

    # Initialize YOLO detector
    print(f"[*] Loading YOLO detector: {model_path}...")
    model = YOLO(model_path)

    # Initialize OCR Reader
    print("[*] Initializing EasyOCR engine (CPU/GPU auto-detect)...")
    reader = easyocr.Reader(['en'], gpu=False, verbose=False)

    # Start multi-threaded video stream
    print(f"[*] Connecting to feed: {source}...")
    stream = ThreadedVideoCapture(source)

    last_capture_time = 0.0
    frame_count = 0

    try:
        while stream.is_running():
            ret, frame = stream.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue

            frame_count += 1
            # Run inference (filter on common vehicle classes)
            results = model.predict(frame, conf=conf_thresh, classes=[2, 3, 5, 7], verbose=False)

            annotated_frame = frame.copy() if not headless else None

            for r in results:
                for box in r.boxes:
                    cls_id = int(box.cls[0].item())
                    vehicle_type = VEHICLE_CLASS_MAP.get(cls_id, "vehicle")
                    box_conf = float(box.conf[0].item())
                    x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                    # Clamp coordinates
                    h_frame, w_frame = frame.shape[:2]
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(w_frame, x2), min(h_frame, y2)

                    # Vehicle type filtering
                    if target_vehicle != "any" and target_vehicle not in vehicle_type:
                        continue

                    vehicle_crop = frame[y1:y2, x1:x2]
                    if vehicle_crop.size == 0:
                        continue

                    # Extract plate region candidate & preprocess
                    plate_crop = extract_plate_candidate(vehicle_crop)
                    processed_plate = preprocess_plate(plate_crop)
                    if processed_plate is None:
                        continue

                    # Run OCR
                    ocr_results = reader.readtext(
                        processed_plate,
                        allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                        detail=1
                    )

                    for bbox, text, ocr_conf in ocr_results:
                        clean_text = clean_plate_string(text)
                        if len(clean_text) < 4:
                            continue

                        # Calculate match score against suspect plate
                        match_score = calculate_match_score(target_plate_clean, clean_text)

                        # Threshold evaluation (e.g., >= 80% match)
                        if match_score >= match_thresh:
                            now = time.time()

                            # Draw on GUI frame
                            if annotated_frame is not None:
                                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                                label = f"SUSPECT MATCH: {clean_text} ({match_score*100:.0f}%) [{vehicle_type.upper()}]"
                                cv2.putText(
                                    annotated_frame,
                                    label,
                                    (x1, max(y1 - 12, 25)),
                                    cv2.FONT_HERSHEY_SIMPLEX,
                                    0.75,
                                    (0, 0, 255),
                                    2
                                )

                            # Debounce snapshot capture
                            if (now - last_capture_time) >= debounce_sec:
                                last_capture_time = now
                                ts_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]

                                # Paths
                                snap_path = os.path.join(CAPTURE_DIR, f"suspect_full_{clean_text}_{ts_str}.jpg")
                                veh_path = os.path.join(CAPTURE_DIR, f"suspect_veh_{clean_text}_{ts_str}.jpg")
                                plt_path = os.path.join(CAPTURE_DIR, f"suspect_plt_{clean_text}_{ts_str}.jpg")

                                # Save high-res evidentiary images
                                cv2.imwrite(snap_path, frame)
                                cv2.imwrite(veh_path, vehicle_crop)
                                cv2.imwrite(plt_path, plate_crop)

                                # Log to alerts CSV
                                with open(LOG_FILE, "a", newline="", encoding="utf-8") as f:
                                    writer = csv.writer(f)
                                    writer.writerow([
                                        datetime.now().isoformat(),
                                        str(source),
                                        target_plate_clean,
                                        clean_text,
                                        target_vehicle,
                                        vehicle_type,
                                        f"{match_score:.2f}",
                                        f"{ocr_conf:.2f}",
                                        f"[{x1},{y1},{x2},{y2}]",
                                        snap_path,
                                        veh_path,
                                        plt_path
                                    ])

                                print(f"\n[ALERT - SUSPECT INTERCEPT]")
                                print(f" > Timestamp         : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                                print(f" > Target Plate      : {target_plate_clean}")
                                print(f" > Detected Plate    : {clean_text} (Match: {match_score*100:.1f}%, OCR Conf: {ocr_conf*100:.1f}%)")
                                print(f" > Vehicle Type      : {vehicle_type.upper()}")
                                print(f" > Full Snapshot     : {snap_path}")
                                print(f" > Vehicle Crop      : {veh_path}")
                                print(f" > Plate Crop        : {plt_path}\n")

                                # Forward dynamic detection event to Nirikshan Web Intelligence Hub
                                try:
                                    import urllib.request
                                    import json
                                    cam_id = f"cam{str(source).zfill(2)}" if str(source).isdigit() else str(source)
                                    if not cam_id.startswith("cam"):
                                        cam_id = "cam01"
                                    api_payload = json.dumps({
                                        "camera_id": cam_id,
                                        "vehicle_id": clean_text,
                                        "vehicle_type": vehicle_type,
                                        "confidence": float(ocr_conf),
                                        "bounding_box": [int(x1), int(y1), int(x2), int(y2)],
                                        "snapshot_url": f"/captures/{os.path.basename(snap_path)}"
                                    }).encode('utf-8')
                                    req = urllib.request.Request(
                                        "http://localhost:10000/api/detections",
                                        data=api_payload,
                                        headers={"Content-Type": "application/json"}
                                    )
                                    urllib.request.urlopen(req, timeout=1.5)
                                except Exception as post_err:
                                    pass

            # Display GUI window if not in headless mode
            if not headless and annotated_frame is not None:
                # Add status overlay
                cv2.putText(
                    annotated_frame,
                    f"Surveillance Active | Target: {target_plate_clean} ({target_vehicle.upper()}) | Source: {source}",
                    (15, 30),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 255, 0),
                    2
                )
                cv2.imshow("Nirikshan Live Surveillance & Suspect Tracker", annotated_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:  # ESC or q
                    print("[*] Operator requested shutdown.")
                    break

    except KeyboardInterrupt:
        print("\n[*] Stopping surveillance tracker...")
    finally:
        stream.release()
        if not headless and cv2 is not None:
            cv2.destroyAllWindows()
        print("[*] Surveillance tracker terminated safely.")


def main():
    parser = argparse.ArgumentParser(
        description="Nirikshan Real-Time CCTV Suspect Vehicle Tracking & Evidentiary Snapshot Engine"
    )
    parser.add_argument(
        "--source",
        type=str,
        default="0",
        help="Input video source: Webcam index (e.g. 0), RTSP URL (rtsp://...), or local video file (.mp4)"
    )
    parser.add_argument(
        "--target-plate",
        type=str,
        required=True,
        help="Target suspect license plate or substring (e.g. GJ01AB1234 or GJ01)"
    )
    parser.add_argument(
        "--target-vehicle",
        type=str,
        default="any",
        choices=["any", "car", "truck", "bus", "motorcycle"],
        help="Target suspect vehicle category filter (default: any)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="yolov8n.pt",
        help="YOLOv8 weights path or model name (default: yolov8n.pt)"
    )
    parser.add_argument(
        "--conf-thresh",
        type=float,
        default=0.35,
        help="YOLO detection confidence threshold (default: 0.35)"
    )
    parser.add_argument(
        "--match-thresh",
        type=float,
        default=0.80,
        help="Target plate match confidence threshold 0.0-1.0 (default: 0.80 for >=80%% match)"
    )
    parser.add_argument(
        "--debounce",
        type=float,
        default=4.0,
        help="Debounce window in seconds to avoid redundant captures for the same suspect vehicle (default: 4.0)"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without displaying a graphical window (ideal for background / server deployments)"
    )

    args = parser.parse_args()
    run_surveillance(
        source=args.source,
        target_plate=args.target_plate,
        target_vehicle=args.target_vehicle,
        model_path=args.model,
        conf_thresh=args.conf_thresh,
        match_thresh=args.match_thresh,
        debounce_sec=args.debounce,
        headless=args.headless
    )


if __name__ == "__main__":
    main()
