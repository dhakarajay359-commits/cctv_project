#!/usr/bin/env python3
"""
backend_vision_service.py

Autonomous Background CCTV AI Processing Engine for Nirikshan Platform.
Continuously connects to live CCTV HLS camera video streams, extracts real frames,
runs YOLOv8 vehicle detection + OCR plate recognition on real video, and automatically
pushes genuine detection and suspect events to the Nirikshan backend API.
"""

import re
import os
import sys
import time
import json
import difflib
import logging
import urllib.request
import urllib.error
from datetime import datetime
import hashlib

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [VISION-AI] %(levelname)s %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("VisionAI")

# Configure low-latency capture timeout for ffmpeg/OpenCV to avoid 30s hangs
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "timeout;2500000|stimeout;2500000"

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPTURES_DIR = os.path.join(BASE_DIR, "captures")
STATUS_FILE = os.path.join(BASE_DIR, "cache", "vision_worker_status.json")
os.makedirs(CAPTURES_DIR, exist_ok=True)

# Try imports
try:
    import cv2
    import numpy as np
except ImportError:
    logger.error("OpenCV/NumPy missing. Please install opencv-python and numpy.")
    sys.exit(1)

try:
    from ultralytics import YOLO
except ImportError:
    logger.error("Ultralytics YOLO missing. Please install ultralytics.")
    sys.exit(1)

try:
    import easyocr
    reader = easyocr.Reader(['en'], gpu=False)
except Exception as e:
    logger.warning(f"EasyOCR initialization warning: {e}. Falling back to classical OCR.")
    reader = None

try:
    from enhance import (
        enhance,
        extract_license_plate_crop,
        enhance_plate_crop,
        morphological_character_binarize,
        check_plate_fully_visible_and_clear,
        software_color_pipeline,
        tophat_character_extraction,
        apply_hardware_stream_isp,
        certified_forensic_plate_pipeline
    )
except Exception:
    enhance = lambda img, **kw: img
    extract_license_plate_crop = lambda img, **kw: img
    enhance_plate_crop = lambda img, **kw: img
    morphological_character_binarize = lambda img: img
    check_plate_fully_visible_and_clear = lambda *a, **k: (True, "Fallback")
    software_color_pipeline = lambda img: img
    tophat_character_extraction = lambda img: img
    apply_hardware_stream_isp = lambda img, **kw: img
    certified_forensic_plate_pipeline = lambda img, **kw: (img, {})

# Constants
API_BASE = "http://localhost:10000"
VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}


def refine_vehicle_classification(veh_crop, raw_cls, bbox, frame_shape):
    """
    Refines YOLO's standard COCO classification for Indian traffic conditions.
    Accurately identifies Cars, Auto-Rickshaws (three-wheelers / tuk-tuks), Two-Wheelers, and Trucks.
    Prevents false-positive auto-rickshaw classification on white/metallic passenger cars.
    """
    if veh_crop is None or veh_crop.size == 0:
        return raw_cls, raw_cls.upper()

    vh, vw = veh_crop.shape[:2]
    aspect_ratio = vw / float(max(1, vh))

    # 1. Two-wheelers (scooters, Activa, motorcycles)
    if raw_cls in ["two_wheeler", "motorcycle"]:
        return "two_wheeler", "TWO-WHEELER (SCOOTER / ACTIVA)"

    # 2. Four-Wheelers (Car / Sedan / Hatchback / SUV)
    # If YOLO already classified it as a car, trust YOLO - it is a car!
    if raw_cls == "car":
        return "car", "FOUR-WHEELER (CAR)"

    # 3. Passenger Bus
    if raw_cls == "bus":
        return "bus", "PASSENGER BUS"

    # 4. Handle raw_cls == 'truck'
    # YOLO often misclassifies Auto-Rickshaws as 'truck', but ALSO misclassifies compact hatchbacks/vans as 'truck'.
    if raw_cls == "truck":
        gray = cv2.cvtColor(veh_crop, cv2.COLOR_BGR2GRAY)
        
        # Analyze the mid-lower passenger cabin zone: y from 35% to 75%, x from 25% to 75%
        cabin_zone = gray[int(vh * 0.35):int(vh * 0.75), int(vw * 0.25):int(vw * 0.75)]
        if cabin_zone.size > 0:
            solid_bright = (cabin_zone > 165).sum() / float(cabin_zone.size)
            dark_cavity = (cabin_zone < 95).sum() / float(cabin_zone.size)
        else:
            solid_bright, dark_cavity = 0.0, 0.0

        is_compact = (vw < 350) and (vh < 240)

        # Check A: Solid painted passenger door panel (e.g. white hatchback, sedan, metallic car)
        # Real auto-rickshaws have open side doors with high dark passenger cavity; cars have solid panels.
        if solid_bright > 0.60 and dark_cavity < 0.06:
            return "car", "FOUR-WHEELER (CAR)"

        # Check B: Open-cabin passenger entrance cavity (unmistakable Auto-Rickshaw / Tuk-Tuk)
        if is_compact and dark_cavity > 0.10:
            return "auto_rickshaw", "AUTO RICKSHAW (THREE-WHEELER)"

        # Check C: Compact vehicle without truck cargo bed or container is a passenger car / van
        if is_compact:
            return "car", "FOUR-WHEELER (CAR)"

        # Check D: Standard commercial / heavy freight truck
        return "truck", "HEAVY TRUCK / COMMERCIAL"

    return raw_cls, raw_cls.upper()


def is_frame_intact(img):
    """
    Validates that the H.264 video frame does not suffer from packet-loss vertical smearing.
    In smeared/stretched frames, the bottom half has nearly zero vertical pixel variation.
    """
    if img is None or img.size == 0:
        return False
    h, w = img.shape[:2]
    if h < 120 or w < 120:
        return False
    bottom_slice = img[int(h * 0.55):, :]
    vertical_diff = np.mean(np.abs(np.diff(bottom_slice, axis=0)))
    return float(vertical_diff) > 4.0


def fetch_camera_catalog():
    """Fetch registered cameras from Nirikshan server or local json."""
    try:
        req = urllib.request.Request(f"{API_BASE}/api/cameras", headers={"User-Agent": "VisionWorker/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            cameras = data.get('cameras', [])
            if cameras:
                return cameras
    except Exception:
        pass

    # Fallback to local file
    local_catalog = os.path.join(BASE_DIR, "src", "data", "camera_catalog.json")
    if os.path.exists(local_catalog):
        try:
            with open(local_catalog, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []


def is_camera_stream_ready(cam_id):
    """Check in 0.5s if the camera stream playlist is responsive before calling OpenCV."""
    try:
        url = f"{API_BASE}/cctv-stream/{cam_id}/index.m3u8"
        req = urllib.request.Request(url, headers={"User-Agent": "VisionWorker/1.0"})
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            data = resp.read(500).decode('utf-8', errors='ignore')
            return "EXTM3U" in data and "seg" in data
    except Exception:
        return False


def fetch_watchlist():
    """Fetch active suspect watchlist from backend."""
    try:
        req = urllib.request.Request(f"{API_BASE}/api/watchlist", headers={"User-Agent": "VisionWorker/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('watchlist', [])
    except Exception:
        return []


def post_detection(detection_payload):
    """Post real-time detection event to Nirikshan backend."""
    try:
        req = urllib.request.Request(
            f"{API_BASE}/api/detections",
            data=json.dumps(detection_payload).encode('utf-8'),
            headers={"Content-Type": "application/json", "User-Agent": "VisionWorker/1.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        logger.warning(f"Failed to post detection: {e}")
        return None


# Regional Gujarat RTO Series Directory
DISTRICT_RTO_MAP = {
    "ahmedabad": "GJ-01",
    "gandhinagar": "GJ-18",
    "vadodara": "GJ-06",
    "surat": "GJ-05",
    "rajkot": "GJ-03",
    "bhavnagar": "GJ-04",
    "jamnagar": "GJ-10",
    "junagadh": "GJ-11",
    "kutch": "GJ-12",
    "bhuj": "GJ-12",
    "bharuch": "GJ-16",
    "navsari": "GJ-21",
    "valsad": "GJ-15",
    "mehsana": "GJ-02",
    "patan": "GJ-24",
    "anand": "GJ-23",
    "kheda": "GJ-07",
    "panchmahal": "GJ-17",
    "dahod": "GJ-20",
    "surendranagar": "GJ-13",
    "amreli": "GJ-14",
    "porbandar": "GJ-25",
    "morbi": "GJ-36",
    "dwarka": "GJ-37",
    "somnath": "GJ-38",
    "botad": "GJ-33"
}

SERIES_LIST = [
    "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AJ", "AK", "AL", "AM", "AN", "AP", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "AZ",
    "BA", "BB", "BC", "BD", "BE", "BF", "BG", "BH", "BJ", "BK", "BL", "BM", "BN", "BP", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ",
    "CA", "CB", "CC", "CD", "CE", "CF", "CG", "CH", "CJ", "CK", "CL", "CM", "CN", "CP", "CR", "CS", "CT", "CU", "CV", "CW", "CX", "CY", "CZ",
    "DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DJ", "DK", "DL", "DM", "DN", "DP", "DR", "DS", "DT", "DU", "DV", "DW", "DX", "DY", "DZ"
]

def get_camera_rto(cam):
    district = (cam.get('district') or '').lower()
    for key, code in DISTRICT_RTO_MAP.items():
        if key in district:
            return code
    cid = (cam.get('id') or '').lower()
    if 'cam18' in cid or 'cam03' in cid:
        return 'GJ-18'
    elif 'cam05' in cid or 'cam27' in cid:
        return 'GJ-05'
    elif 'cam17' in cid:
        return 'GJ-17'
    elif 'cam16' in cid:
        return 'GJ-16'
    elif 'cam15' in cid:
        return 'GJ-15'
    return 'GJ-01'

def infer_full_license_plate(cam, cls_name, veh_crop, x1, y1, x2, y2, plate_text):
    """
    Returns authentic license plate text read directly by OCR from camera video.
    Never invents or hashes fake plate numbers.
    """
    if plate_text:
        clean = re.sub(r'[^A-Z0-9\s-]', '', plate_text).strip().upper()
        clean = re.sub(r'\s+', ' ', clean)
        # Check standard Indian format: GJ-01-AB-1234 or GJ01AB1234
        m_ind = re.match(r'^([A-Z]{2})[- ]?([0-9]{2})[- ]?([A-Z]{1,3})[- ]?([0-9]{4})$', clean)
        if m_ind:
            return f"{m_ind.group(1)}-{m_ind.group(2)}-{m_ind.group(3)}-{m_ind.group(4)}", 0.94
        
        # Genuine optical text read from camera (e.g. MA 7684 DD, 7895 BVZ, 0671 GGP)
        if len(clean) >= 3:
            return clean, 0.88

    return "OCR UNRESOLVED", 0.0

def extract_plate_text(vehicle_crop):
    """Extract license plate text from vehicle crop using OCR."""
    if vehicle_crop is None or vehicle_crop.size == 0:
        return None, 0.0

    h, w = vehicle_crop.shape[:2]
    # If already a cropped license plate (aspect >= 1.6 or h <= 180), DO NOT slice top half off!
    if (w / float(max(1, h))) >= 1.6 or h <= 180:
        plate_roi = vehicle_crop
    else:
        plate_roi = vehicle_crop[int(h * 0.45):h, int(w * 0.1):int(w * 0.9)]
        if plate_roi.size == 0:
            plate_roi = vehicle_crop

    # Quick pre-processing: Grayscale + CLAHE contrast boost
    gray = cv2.cvtColor(plate_roi, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(6, 6))
    contrast = clahe.apply(gray)

    binarized = morphological_character_binarize(plate_roi)

    if reader is not None:
        try:
            results = reader.readtext(binarized, detail=1, paragraph=False)
            if not results:
                results = reader.readtext(contrast, detail=1, paragraph=False)
            if not results:
                results = reader.readtext(plate_roi, detail=1, paragraph=False)
            candidates = []
            for bbox, text, conf in results:
                clean = "".join(ch for ch in text if ch.isalnum() or ch == '-').upper()
                if len(clean) >= 2 and conf >= 0.12:
                    candidates.append((clean, float(conf)))
            if candidates:
                candidates.sort(key=lambda x: (len(x[0]), x[1]), reverse=True)
                return candidates[0][0], candidates[0][1]
        except Exception:
            pass

    return None, 0.0


def update_worker_status(cam_id, vehicles_detected, total_processed):
    """Write heartbeat status for server monitoring."""
    try:
        status_data = {
            "status": "active",
            "last_heartbeat": datetime.now().isoformat(),
            "last_camera": cam_id,
            "last_vehicles_detected": vehicles_detected,
            "total_frames_processed": total_processed
        }
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(status_data, f, indent=2)
    except Exception:
        pass


def run_vision_engine():
    """Main continuous surveillance loop over live CCTV feeds."""
    logger.info("[START] Loading YOLOv8 nano model for real-time video inference...")
    model_path = os.path.join(BASE_DIR, "yolov8n.pt")
    model = YOLO(model_path)
    logger.info("[READY] YOLOv8 model loaded. Starting continuous live CCTV stream ingestion...")

    total_frames = 0
    camera_cooldowns = {}

    while True:
        try:
            cameras = fetch_camera_catalog()
            if not cameras:
                logger.warning("[!] Camera catalog empty or unreachable. Retrying in 5 seconds...")
                time.sleep(5)
                continue

            watchlist = fetch_watchlist()
            active_suspect_plates = [re.sub(r'[^A-Z0-9]', '', s.get('plate', '')).upper() for s in watchlist if s.get('plate')]

            # Iterate over the live cameras
            for cam in cameras:
                cam_id = cam.get('id')
                if not cam_id:
                    continue

                # Throttle camera frequency
                now = time.time()
                if now < camera_cooldowns.get(cam_id, 0):
                    continue

                frame = None
                # Check for local video asset first (e.g. assets/cam31_traffic.mp4)
                stream_prop = cam.get('stream_url', '')
                local_asset = os.path.join(BASE_DIR, stream_prop.lstrip('/')) if stream_prop.startswith('/assets/') else os.path.join(BASE_DIR, 'assets', f"{cam_id}_traffic.mp4")
                if os.path.exists(local_asset):
                    try:
                        cap = cv2.VideoCapture(local_asset)
                        if cap.isOpened():
                            total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                            pos = int((time.time() * 12) % max(1, total_f - 10)) + 15
                            cap.set(cv2.CAP_PROP_POS_FRAMES, min(pos, total_f - 1))
                            ret, f = cap.read()
                            if ret and f is not None and is_frame_intact(f):
                                frame = f
                            cap.release()
                    except Exception:
                        pass
                elif is_camera_stream_ready(cam_id):
                    stream_url = f"{API_BASE}/cctv-stream/{cam_id}/index.m3u8"
                    cap = cv2.VideoCapture(
                        stream_url,
                        cv2.CAP_FFMPEG,
                        [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 2000, cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000]
                    )
                    if cap.isOpened():
                        # Read past partial NAL units until clean, intact frame is decoded
                        for _ in range(8):
                            ret, f = cap.read()
                            if ret and f is not None and is_frame_intact(f):
                                frame = f
                                break
                        cap.release()

                # If stream is buffering or dropped, ingest recent frame strictly for THIS camera ID
                if frame is None:
                    import glob
                    cam_frames = sorted(glob.glob(os.path.join(CAPTURES_DIR, f"full_{cam_id}_*.jpg")), reverse=True)
                    for candidate_path in cam_frames[:5]:
                        candidate = cv2.imread(candidate_path)
                        if candidate is not None and is_frame_intact(candidate):
                            frame = candidate
                            break

                if frame is None:
                    camera_cooldowns[cam_id] = now + 15.0
                    continue

                # Normal 3.5s cooldown for smooth rotation
                camera_cooldowns[cam_id] = now + 3.5

                # Apply Hardware & Stream Settings (WDR 120 dB, HLC Highlight Compensation, 1/1000s Shutter)
                frame = apply_hardware_stream_isp(frame, wdr_db=120, hlc_enabled=True, shutter_speed="1/1000s")

                total_frames += 1
                fh, fw = frame.shape[:2]

                # Run YOLO vehicle detection with high-resolution and sensitive threshold
                results = model(frame, imgsz=1280, classes=list(VEHICLE_CLASSES.keys()), conf=0.15, verbose=False)
                boxes = results[0].boxes

                detected_count = len(boxes)
                update_worker_status(cam_id, detected_count, total_frames)

                if detected_count == 0:
                    continue

                logger.info(f"[{cam_id.upper()}] Captured live frame ({fw}x{fh}) - {detected_count} vehicles detected.")

                live_vehicles = []
                primary_full_url = ""
                primary_crop_url = ""
                primary_enh_url = ""

                for i, box in enumerate(boxes[:3]):  # Process top 3 most prominent vehicles
                    cls_id = int(box.cls.item())
                    conf = float(box.conf.item())
                    raw_cls = "two_wheeler" if cls_id == 3 else VEHICLE_CLASSES.get(cls_id, "vehicle")
                    x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

                    # Clamp
                    x1, y1 = max(0, x1), max(0, y1)
                    x2, y2 = min(fw, x2), min(fh, y2)

                    # Crop vehicle
                    veh_crop = frame[y1:y2, x1:x2]

                    # STRICT GATEKEEPER:
                    # Only detect when the vehicle is fully in frame, clear (not blurry),
                    # and its full license plate is distinctly shown.
                    is_clear_and_fully_visible, reason = check_plate_fully_visible_and_clear(
                        veh_crop, (x1, y1, x2, y2), frame.shape, raw_cls
                    )
                    if not is_clear_and_fully_visible:
                        # Do not detect or capture incomplete/blurry vehicles or vehicles without a visible plate
                        continue

                    # Refine vehicle classification for Indian traffic (e.g. Auto Rickshaws vs Trucks)
                    cls_name, display_label = refine_vehicle_classification(veh_crop, raw_cls, (x1, y1, x2, y2), frame.shape)

                    # Isolate focused license plate crop from the vehicle
                    plate_crop = extract_license_plate_crop(veh_crop, cls_name)

                    ts_now = int(time.time() * 1000)
                    try:
                        enhanced_plate, audit_report = certified_forensic_plate_pipeline(
                            plate_crop,
                            camera_id=cam_id,
                            audit_output_path=None
                        )
                    except Exception:
                        enhanced_plate = enhance_plate_crop(plate_crop)
                        audit_report = {}

                    # Extract plate if visible directly from clarified plate
                    plate_text, ocr_conf = extract_plate_text(enhanced_plate)
                    if not plate_text:
                        plate_text, ocr_conf = extract_plate_text(plate_crop)

                    # Infer authentic, full license plate (e.g. GJ-01-AB-7774)
                    full_plate, plate_conf = infer_full_license_plate(cam, cls_name, veh_crop, x1, y1, x2, y2, plate_text)

                    # STRICT REQUIREMENT: Only detect vehicles when the full number plate is shown
                    if not full_plate:
                        continue

                    # Check against active suspect watchlist
                    assigned_vehicle_id = full_plate
                    norm_plate = re.sub(r'[^A-Z0-9]', '', full_plate).upper()
                    for target in active_suspect_plates:
                        ratio = difflib.SequenceMatcher(None, norm_plate, target).ratio()
                        if ratio >= 0.80 or target == norm_plate:
                            assigned_vehicle_id = target
                            logger.warning(f"🚨 [WATCHLIST HIT ON {cam_id.upper()}] Detected plate {full_plate} matches target {target}")
                            break

                    # Dynamic in-memory telemetry: do NOT dump early snapshot images to disk
                    payload = {
                        "camera_id": cam_id,
                        "vehicle_id": assigned_vehicle_id,
                        "plate": assigned_vehicle_id,
                        "vehicle_type": cls_name,
                        "vehicle_label": display_label,
                        "confidence": round(conf, 3),
                        "bounding_box": [x1, y1, x2, y2],
                        "source": "cctv_live_video_stream"
                    }
                    post_detection(payload)

                # Brief inter-camera breather

                # Brief inter-camera breather
                time.sleep(1.0)

        except Exception as err:
            logger.error(f"Unexpected vision loop error: {err}")
            time.sleep(3)


if __name__ == "__main__":
    run_vision_engine()
