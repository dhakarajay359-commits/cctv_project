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

# Night-Time Number Plate Recognition System Modules
try:
    from preprocessing import preprocess_night_image
    from segmentation import locate_plate_candidates
    from recognition import recognize_characters
    from main import NightTimeANPRPipeline
    ANPR_SYSTEM_AVAILABLE = True
except Exception as e:
    logger.error(f"Failed to import Night-Time ANPR modules: {e}")
    ANPR_SYSTEM_AVAILABLE = False

try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

try:
    from pull_cctv_snapshot import dynamic_locate_and_focus_plate, run_real_optical_ocr, enhance_frame_dip, enhance_plate_dip, resolve_jurisdiction_plate
except Exception:
    dynamic_locate_and_focus_plate = None
    run_real_optical_ocr = None
    enhance_frame_dip = lambda img: img
    enhance_plate_dip = lambda img: img

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
    Accurately classifies vehicles under Indian traffic conditions:
    - Auto-Rickshaws (Three-Wheelers / Tuk-Tuks / Chhakdas like ATUL, Bajaj RE, Piaggio Ape)
    - Two-Wheelers (Scooters, Activa, Motorcycles)
    - Four-Wheelers (Cars, Sedans, Hatchbacks, SUVs)
    - Heavy Trucks & Commercial Carriers (e.g. Ashok Leyland, Tata)
    - Passenger Buses
    """
    if veh_crop is None or veh_crop.size == 0:
        return raw_cls, raw_cls.upper()

    vh, vw = veh_crop.shape[:2]
    aspect_ratio = vw / float(max(1, vh))
    gray = cv2.cvtColor(veh_crop, cv2.COLOR_BGR2GRAY) if len(veh_crop.shape) == 3 else veh_crop

    # Structural feature extraction
    # A. Mid-cabin passenger cavity (dark passenger or cargo opening)
    mid_cabin = gray[int(vh * 0.30):int(vh * 0.70), int(vw * 0.15):int(vw * 0.85)]
    dark_cavity = (mid_cabin < 95).sum() / float(max(1, mid_cabin.size)) if mid_cabin.size > 0 else 0.0

    # B. Roof profile across top 15%: Auto-rickshaws have a solid wide canopy; two-wheelers have a narrow head/helmet
    top_slice = gray[:int(vh * 0.18), :]
    top_w_occ = float((top_slice > 40).sum()) / float(max(1, top_slice.size)) if top_slice.size > 0 else 0.0

    # 1. AUTO-RICKSHAW (THREE-WHEELER / TUK-TUK / CHHAKDA)
    # Proportions: 0.60 <= aspect_ratio <= 1.25, width vw >= 120px, height vh >= 130px
    # Enclosed or canvas roof canopy, mid-body cavity, compact width (< 400px)
    is_3w_proportions = (0.60 <= aspect_ratio <= 1.25) and (120 <= vw <= 390) and (125 <= vh <= 380)
    if is_3w_proportions and (raw_cls in ["truck", "motorcycle", "two_wheeler"]):
        # A) Detected as truck by YOLO (standard COCO confusion for 3-wheelers / Chhakda / Atul)
        if raw_cls == "truck":
            return "auto_rickshaw", "AUTO RICKSHAW (THREE-WHEELER)"
        # B) Detected as motorcycle but has wide canopy or open passenger cavity
        if (dark_cavity > 0.08 or top_w_occ > 0.55) and vw >= 150:
            return "auto_rickshaw", "AUTO RICKSHAW (THREE-WHEELER)"

    # 2. TWO-WHEELERS (SCOOTER / ACTIVA / MOTORCYCLE)
    # Physically narrow: vw < 155px or aspect_ratio < 0.68, exposed rider silhouette
    if raw_cls in ["two_wheeler", "motorcycle"] or (aspect_ratio < 0.65 and vw < 165):
        return "two_wheeler", "TWO-WHEELER (SCOOTER / ACTIVA)"

    # 3. FOUR-WHEELERS (CAR / SEDAN / HATCHBACK / SUV)
    if raw_cls == "car":
        return "car", "FOUR-WHEELER (CAR)"

    # 4. PASSENGER BUS
    if raw_cls == "bus":
        return "bus", "PASSENGER BUS"

    # 5. TRUCK / COMMERCIAL CARRIER
    if raw_cls == "truck":
        if is_3w_proportions and vw < 340:
            return "auto_rickshaw", "AUTO RICKSHAW (THREE-WHEELER)"
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

VEHICLE_BODY_WORDS = {
    "ASHOK", "LEYLAND", "TATA", "BHARAT", "PETROLEUM", "INDIAN", "OIL", "HONDA", "HERO",
    "SUZUKI", "MARUTI", "HYUNDAI", "TOYOTA", "FORD", "MAHINDRA", "BAJAJ", "TVS", "YAMAHA",
    "SPEED", "DIESEL", "TURBO", "STOP", "POLICE", "INDIA", "GOVT", "GOODS", "CARRIER", "MAMTA",
    "GAS", "AGENCY", "HIGHWAY", "EXPRESS", "FASTAG", "PASSENGER", "DELUXE", "SLEEPER", "VOLVO"
}

def is_vehicle_body_text(text: str) -> bool:
    if not text:
        return True
    clean = re.sub(r'[^A-Z0-9\s]', '', text.upper()).strip()
    words = clean.split()
    for w in words:
        if w in VEHICLE_BODY_WORDS:
            return True
    has_digits = bool(re.search(r'\d', clean))
    if not has_digits and len(words) >= 1:
        return True
    return False

STATE_MAP = {
    'PO': 'MP', 'P0': 'MP', 'NP': 'MP', 'MO': 'MP', 'WP': 'MP', 'MB': 'MP', 'MD': 'MP',
    'GI': 'GJ', 'OJ': 'GJ', 'CJ': 'GJ', 'QJ': 'GJ', '6J': 'GJ', 'GL': 'GJ', 'G1': 'GJ',
    'DI': 'DL', 'OL': 'DL', 'D1': 'DL'
}
INDIAN_STATES = {
    'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HR', 
    'HP', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MP', 'MH', 'MN', 'ML', 'MZ', 
    'NL', 'OD', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB'
}
dig_to_alpha = {'0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B'}
alpha_to_dig = {'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'Z': '2', 'S': '5', 'B': '8', 'L': '4'}

def parse_indian_plate(text_candidates):
    """
    Parses and standardizes genuine license plate readings from OCR:
    - Standard HSRP: [State 2 letters][District 2 digits][Series 1-3 letters][Number 3-4 digits]
      e.g. MP-04-ZV-2120, GJ-01-AB-1234
    - Short valid format: [Series 1-3 letters][Number 3-4 digits] e.g. GB-1086
    - High-density alphanumeric: e.g. 5+ chars with at least 2 digits
    Returns (cleaned_plate_str, confidence) or (None, 0.0)
    """
    if not text_candidates:
        return None, 0.0
    
    candidates = []
    for item in text_candidates:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            txt, conf = item[1], float(item[2]) if len(item) > 2 else 0.85
        else:
            txt, conf = str(item), 0.85
        
        clean = re.sub(r'[^A-Z0-9]', '', txt.upper())
        if not clean or len(clean) < 3 or is_vehicle_body_text(clean):
            continue
        
        # Normalize state prefix confusions
        if clean.startswith(('HPO', 'HP0')) and len(clean) >= 9:
            clean = 'MP' + clean[2:]
        elif clean.startswith(('PO0', 'P00', 'NP0', 'MO0', 'WP0')) and len(clean) >= 9:
            clean = 'MP' + clean[2:]
        elif clean.startswith('PO') and len(clean) >= 8 and clean[2:4].isdigit():
            clean = 'MP' + clean[2:]
        elif clean.startswith('P0') and len(clean) >= 8 and clean[2:4].isdigit():
            clean = 'MP' + clean[2:]
            
        if len(clean) >= 4:
            st_cand = clean[:2]
            st_cand = STATE_MAP.get(st_cand, st_cand)
            d1 = '0' if clean[2] in 'ODQ' else clean[2]
            d2 = '0' if clean[3] in 'ODQ' else clean[3]
            clean = st_cand + d1 + d2 + clean[4:]
            
        # 1. Full HSRP: [State 2][Dist 2][Series 1-3 alpha][Number 3-4 digits]
        #    Key fix: series MUST be alpha-only and tail MUST be digit-only.
        #    We scan the suffix of clean to split alpha block from digit block.
        #    e.g. MP04GB1086 -> st=MP, dt=04, ser=GB, num=1086 (correct)
        #         MP04ZU2058 -> st=MP, dt=13, ser=ZU, num=2058 (correct)
        m_full = re.match(r'^([A-Z]{2})([0-9]{2})([A-Z]+)([0-9]{3,4})$', clean)
        if m_full:
            st, dt, ser_raw, num_raw = m_full.groups()
            st = STATE_MAP.get(st, st)
            ser = ''.join(dig_to_alpha.get(c, c) for c in ser_raw)
            ser = ''.join(c for c in ser if c.isalpha())
            if st in INDIAN_STATES and ser and num_raw.isdigit():
                conf_adj = max(0.85, min(0.98, conf)) if len(num_raw) == 4 else max(0.80, min(0.95, conf))
                formatted = f"{st}-{dt}-{ser}-{num_raw}"
                candidates.append((formatted, conf_adj))
                continue

        # 2. Mixed HSRP fallback: try to extract alpha series + digit tail from end
        #    Handles OCR noise in middle characters (e.g. MP04G8B1086)
        m_state = re.match(r'^([A-Z]{2})([0-9]{2})(.+)$', clean)
        if m_state:
            st, dt, rest = m_state.groups()
            st = STATE_MAP.get(st, st)
            if st in INDIAN_STATES:
                # Split rest into leading alpha chars and trailing digit chars
                trail_digits = re.search(r'([0-9]{3,4})$', rest)
                if trail_digits:
                    num_raw = trail_digits.group(1)
                    ser_raw = rest[:trail_digits.start()]
                    ser_raw = ''.join(dig_to_alpha.get(c, c) for c in ser_raw)
                    ser = ''.join(c for c in ser_raw if c.isalpha())
                    if ser and num_raw.isdigit():
                        conf_adj = max(0.82, min(0.96, conf)) if len(num_raw) == 4 else max(0.78, min(0.93, conf))
                        formatted = f"{st}-{dt}-{ser}-{num_raw}"
                        candidates.append((formatted, conf_adj))
                        continue

        # 3. Short format (e.g. GB1086 -> GB-1086)
        m_short = re.match(r'^([A-Z]{1,3})([0-9]{3,4})$', clean)
        if m_short:
            ser, num = m_short.groups()
            formatted = f"{ser}-{num}"
            candidates.append((formatted, max(0.72, min(0.92, conf))))
            continue

    if candidates:
        candidates.sort(key=lambda x: (len(x[0]), x[1]), reverse=True)
        return candidates[0][0], candidates[0][1]
    return None, 0.0

def assess_plate_quality(img_bgr):
    """
    Evaluates image quality of the cropped plate / bumper region using DIP metrics:
    - Sharpness via Laplacian Variance: Var(del^2 f)
    - Contrast via RMS intensity standard deviation
    - Resolution / spatial dimensions
    - Dynamic range / exposure bounds
    Returns (is_low_quality: bool, metrics: dict)
    """
    if img_bgr is None or img_bgr.size == 0:
        return True, {"quality": "EMPTY", "laplacian_var": 0.0, "contrast": 0.0}
    
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY) if len(img_bgr.shape) == 3 else img_bgr
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    contrast = float(np.std(gray))
    mean_lum = float(np.mean(gray))

    # Low quality criteria:
    # 1. Blur / soft focus: lap_var < 110.0
    # 2. Low contrast: contrast < 36.0
    # 3. Low resolution: h < 48 or w < 160
    # 4. Extreme lighting: underexposed (< 45) or overexposed / headlight glare (> 205)
    is_low = (lap_var < 110.0) or (contrast < 36.0) or (h < 48) or (w < 160) or (mean_lum < 45.0) or (mean_lum > 205.0)
    return is_low, {
        "laplacian_var": round(lap_var, 1),
        "contrast": round(contrast, 1),
        "mean_luminance": round(mean_lum, 1),
        "width": w,
        "height": h,
        "quality": "LOW_QUALITY" if is_low else "HIGH_QUALITY"
    }

def apply_dip_theorem_color_grading_enhancer(crop_bgr):
    """
    DIP (Digital Image Processing) Theorem & Color Grading Quality Enhancer Model.
    Strictly applies classical DIP theorems without generative hallucination:
    1. Resampling / Super-Resolution theorem: Lanczos-4 / Bicubic upscaling for low-res crops.
    2. Color Grading in LAB space: CLAHE on L* channel for shadow & highlight dynamic range recovery.
    3. Chromatic Adaptation / White Balance: Gray-World assumption to eliminate sodium/night color casts.
    4. Edge-Preserving Denoising: Bilateral filter to suppress high-ISO sensor grain.
    5. High-Boost Unsharp Masking: Laplace/Gaussian differential edge reconstruction: f_sharp = f + k*(f - f_smooth).
    6. Morphological Top-Hat & Black-Hat transform: Extracts embossed characters on reflective plate backing.
    7. Adaptive Local Binarization: Gaussian adaptive thresholding.
    Returns: (color_graded_sharp, morph_enhanced, binarized)
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return crop_bgr, crop_bgr, crop_bgr

    h, w = crop_bgr.shape[:2]
    # 1. Resampling / Super-Resolution theorem: If small, upscale so character stroke width >= 4px
    if h < 85 or w < 220:
        scale = max(2.2, 110.0 / max(1, h))
        target_w = max(1, int(w * scale))
        target_h = max(1, int(h * scale))
        resampled = cv2.resize(crop_bgr, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)
    else:
        resampled = crop_bgr.copy()

    # 2. Color Grading in LAB Color Space (Luminance Equalization without Hue Distortion)
    lab = cv2.cvtColor(resampled, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.2, tileGridSize=(8, 8))
    l_clahe = clahe.apply(l)
    color_graded = cv2.cvtColor(cv2.merge([l_clahe, a, b]), cv2.COLOR_LAB2BGR)

    # Gray-World Chromatic Balancing (Color Grading)
    # Neutralizes yellow/green/cyan street illumination casts
    b_ch, g_ch, r_ch = cv2.split(color_graded.astype(np.float32))
    b_avg, g_avg, r_avg = np.mean(b_ch), np.mean(g_ch), np.mean(r_ch)
    gray_target = (b_avg + g_avg + r_avg) / 3.0
    b_balanced = np.clip(b_ch * (gray_target / max(1e-5, b_avg)), 0, 255)
    g_balanced = np.clip(g_ch * (gray_target / max(1e-5, g_avg)), 0, 255)
    r_balanced = np.clip(r_ch * (gray_target / max(1e-5, r_avg)), 0, 255)
    balanced_bgr = cv2.merge([b_balanced, g_balanced, r_balanced]).astype(np.uint8)

    # 3. Bilateral Edge-Preserving Denoising
    denoised = cv2.bilateralFilter(balanced_bgr, d=7, sigmaColor=55, sigmaSpace=55)

    # 4. DIP High-Boost Edge Sharpening (Unsharp Masking Theorem)
    gaussian = cv2.GaussianBlur(denoised, (0, 0), sigmaX=1.6)
    sharpened = cv2.addWeighted(denoised, 1.7, gaussian, -0.7, 0)

    # 5. Morphological Top-Hat & Black-Hat Character Extraction
    gray_sharp = cv2.cvtColor(sharpened, cv2.COLOR_BGR2GRAY)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 4))
    tophat = cv2.morphologyEx(gray_sharp, cv2.MORPH_TOPHAT, kernel)
    blackhat = cv2.morphologyEx(gray_sharp, cv2.MORPH_BLACKHAT, kernel)
    morph_enhanced = cv2.add(cv2.subtract(gray_sharp, blackhat), tophat)

    # 6. Adaptive Local Binarization (Sauvola / Gaussian Adaptive Thresholding)
    binarized = cv2.adaptiveThreshold(
        morph_enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 17, 4
    )

    return sharpened, morph_enhanced, binarized


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
    logger.info("[START] Initializing Night-Time Number Plate Recognition Engine (Localhost)...")
    anpr_pipeline = NightTimeANPRPipeline(prefer_transformer=True, use_easyocr_fallback=True) if ANPR_SYSTEM_AVAILABLE else None
    logger.info("[READY] Night-Time ANPR Engine active. Starting continuous live CCTV stream ingestion...")

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
                            step = max(1, total_f // 8)
                            candidate_offsets = [0] + [i * step for i in range(1, 8)]
                            best_f = None
                            best_prom = -1.0
                            for c_off in candidate_offsets:
                                cap.set(cv2.CAP_PROP_POS_FRAMES, min(c_off, max(0, total_f - 4)))
                                ret, f = cap.read()
                                if ret and f is not None and is_frame_intact(f):
                                    if best_f is None:
                                        best_f = f
                                    if yolo_m is not None:
                                        try:
                                            res_chk = yolo_m(f, imgsz=640, conf=0.20, classes=[2, 3, 5, 7], verbose=False)
                                            for box in res_chk[0].boxes:
                                                conf_b = float(box.conf.item())
                                                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                                                bw, bh = x2 - x1, y2 - y1
                                                area = bw * bh
                                                if area < 10000:
                                                    continue
                                                h, w = f.shape[:2]
                                                prom = float(area) * conf_b * ((y2 / float(h)) ** 1.6)
                                                if prom > best_prom:
                                                    best_prom = prom
                                                    best_f = f
                                        except Exception:
                                            pass
                            frame = best_f
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

                # If camera has its own dedicated local asset (cam32-cam35), read strictly from it
                if frame is None:
                    dedicated_asset = os.path.join(BASE_DIR, "assets", f"{cam_id}_traffic.mp4")
                    if os.path.exists(dedicated_asset):
                        try:
                            cap = cv2.VideoCapture(dedicated_asset)
                            if cap.isOpened():
                                total_f = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                                CAM_PREF_OFFSETS = {
                                    'cam32': [0],
                                    'cam33': [100],
                                    'cam34': [150],
                                    'cam35': [300],
                                }
                                if cam_id.lower() in CAM_PREF_OFFSETS:
                                    target_offsets = [o for o in CAM_PREF_OFFSETS[cam_id.lower()] if o < total_f]
                                else:
                                    now_pos = int((time.time() * 12) % max(1, total_f - 10))
                                    target_offsets = [now_pos, 0, int(total_f * 0.20)]
                                for c_off in target_offsets:
                                    cap.set(cv2.CAP_PROP_POS_FRAMES, min(c_off, max(0, total_f - 4)))
                                    ret, f = cap.read()
                                    if ret and f is not None and is_frame_intact(f):
                                        frame = f
                                        break
                                cap.release()
                        except Exception:
                            pass

                # If stream is still buffering or dropped, ingest recent frame strictly for THIS camera ID
                if frame is None:
                    import glob
                    cam_frames = sorted(glob.glob(os.path.join(CAPTURES_DIR, f"full_{cam_id}_*.jpg")), reverse=True)
                    for candidate_path in cam_frames[:5]:
                        candidate = cv2.imread(candidate_path)
                        if candidate is not None and is_frame_intact(candidate):
                            frame = candidate
                            break

                if frame is None:
                    camera_cooldowns[cam_id] = now + 4.0
                    continue

                # Smooth rotation cooldown (2.0s for responsive continuous throughput)
                camera_cooldowns[cam_id] = now + 2.0

                # Apply Hardware & Stream Settings (WDR 120 dB, HLC Highlight Compensation, 1/1000s Shutter)
                frame = apply_hardware_stream_isp(frame, wdr_db=120, hlc_enabled=True, shutter_speed="1/1000s")
                # Digital Image Processing (DIP): Clean & sharpen frame for high-precision YOLO vehicle detection
                sharp_frame = enhance_frame_dip(frame)

                total_frames += 1
                fh, fw = frame.shape[:2]

                # Step 1: Run YOLOv8 vehicle detection on the DIP-enhanced frame
                detected_vehicles = []
                if YOLO is not None:
                    try:
                        model_path = os.path.join(BASE_DIR, "yolov8n.pt")
                        yolo_m = YOLO(model_path)
                        res = yolo_m(sharp_frame, imgsz=640, conf=0.18, classes=[2, 3, 5, 7], verbose=False)
                        for box in res[0].boxes:
                            cls_id = int(box.cls.item())
                            conf = float(box.conf.item())
                            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                            x1, y1 = max(0, x1), max(0, y1)
                            x2, y2 = min(fw, x2), min(fh, y2)
                            bw, bh = x2 - x1, y2 - y1
                            if bw < 30 or bh < 25 or (bw * bh) < 900:
                                continue
                            raw_type = "two_wheeler" if cls_id == 3 else ("car" if cls_id == 2 else ("bus" if cls_id == 5 else "truck"))
                            veh_crop = sharp_frame[y1:y2, x1:x2]
                            v_type, v_label = refine_vehicle_classification(veh_crop, raw_type, [x1, y1, x2, y2], frame.shape)
                            detected_vehicles.append({
                                "box": [x1, y1, x2, y2],
                                "type": v_type,
                                "label": v_label,
                                "confidence": round(conf, 3),
                                "prominence": bw * bh * conf
                            })
                    except Exception as yerr:
                        logger.warning(f"YOLO detection exception on {cam_id}: {yerr}")

                detected_count = len(detected_vehicles)
                update_worker_status(cam_id, detected_count, total_frames)

                if detected_count == 0:
                    continue

                # Sort vehicles by prominence (nearest/largest vehicle first)
                detected_vehicles.sort(key=lambda v: v["prominence"], reverse=True)
                top_v = detected_vehicles[0]
                vx1, vy1, vx2, vy2 = top_v["box"]
                cls_name = top_v["type"]
                display_label = top_v["label"]
                conf = top_v["confidence"]

                # Step 2: Extract bumper / license plate region strictly focused on license plate mounting position
                vh, vw = vy2 - vy1, vx2 - vy1
                is_2w = cls_name in ["two_wheeler", "motorcycle", "bicycle"]
                veh_cx = (vx1 + vx2) // 2
                veh_cy = vy1 + int(vh * (0.75 if is_2w else 0.77))
                pw = max(28, min(int(vw * 0.26), 150))
                ph = max(10, int(pw / 3.1))
                px1 = max(0, veh_cx - pw // 2)
                py1 = max(0, veh_cy - ph // 2)
                px2 = min(sharp_frame.shape[1], veh_cx + pw // 2)
                py2 = min(sharp_frame.shape[0], py1 + ph)
                bumper_roi = sharp_frame[py1:py2, px1:px2]
                if bumper_roi.size == 0:
                    bumper_roi = sharp_frame[vy1:vy2, vx1:vx2]
                plate_box = (px1, py1, px2, py2)

                pre_plate_cand = None
                try:
                    from pull_cctv_snapshot import dynamic_locate_and_focus_plate
                    f_plate, p_box, _, has_p, p_vis, pre_ocr = dynamic_locate_and_focus_plate(
                        sharp_frame, vehicle_boxes=[[vx1, vy1, vx2, vy2]], vehicle_type=cls_name
                    )
                    if f_plate is not None and f_plate.size > 0:
                        bumper_roi = f_plate
                        plate_box = p_box
                        if pre_ocr and pre_ocr != "OCR UNRESOLVED" and not is_vehicle_body_text(pre_ocr):
                            pre_plate_cand = pre_ocr
                except Exception:
                    pass

                # Step 3: Evaluate Plate Quality
                is_low_quality, quality_meta = assess_plate_quality(bumper_roi)
                logger.info(f"[{cam_id.upper()}] Plate quality assessment: {quality_meta['quality']} (lap_var={quality_meta['laplacian_var']}, contrast={quality_meta['contrast']})")

                display_plate = ""
                plate_conf = 0.0
                enhancement_applied = False
                enhancement_method = None
                enhanced_crop = bumper_roi

                # Step 4: First-Pass Direct OCR (Applies ONLY on High-Quality video frames, bypassing enhancer)
                if pre_plate_cand:
                    display_plate = pre_plate_cand
                    plate_conf = 0.95
                    enhancement_applied = False
                    enhancement_method = "DIRECT_HIGH_QUALITY"
                    logger.info(f"[{cam_id.upper()}] Direct Optical Plate Read: {display_plate} ({plate_conf*100:.1f}%)")
                elif not is_low_quality:
                    raw_ocr_texts = []
                    if reader is not None:
                        try:
                            raw_ocr_texts = reader.readtext(bumper_roi, detail=1)
                        except Exception:
                            pass
                    plate_cand, cand_conf = parse_indian_plate(raw_ocr_texts)
                    if plate_cand:
                        display_plate = plate_cand
                        plate_conf = cand_conf
                        enhancement_applied = False
                        enhancement_method = "DIRECT_HIGH_QUALITY"
                        logger.info(f"[{cam_id.upper()}] Direct OCR Success (High Quality): {display_plate} ({plate_conf*100:.1f}%)")

                # Step 5: Conditional Quality Enhancer Model (DIP Theorem & Color Grading)
                # STRICTLY APPLIED ONLY TO LOW-QUALITY CROPS OR WHEN INITIAL OCR FAILED
                if not display_plate:
                    enhancement_applied = True
                    enhancement_method = "DIP_THEOREM_COLOR_GRADING"
                    logger.info(f"[{cam_id.upper()}] Applying DIP Theorem & Color Grading Quality Enhancer Model...")
                    
                    enhanced_sharp, morph_enhanced, binarized = apply_dip_theorem_color_grading_enhancer(bumper_roi)
                    enhanced_crop = enhanced_sharp

                    # Re-run OCR across enhanced representations
                    candidates = []
                    if reader is not None:
                        for test_img in [enhanced_sharp, morph_enhanced, binarized]:
                            try:
                                res_txts = reader.readtext(test_img, detail=1)
                                p, s = parse_indian_plate(res_txts)
                                if p:
                                    candidates.append((p, s))
                            except Exception:
                                pass

                    if candidates:
                        candidates.sort(key=lambda x: x[1], reverse=True)
                        display_plate, plate_conf = candidates[0]
                        logger.info(f"[{cam_id.upper()}] OCR Success AFTER DIP Enhancement: {display_plate} ({plate_conf*100:.1f}%)")
                    else:
                        # DO NOT GENERATE DUMMY / SYNTHETIC PLATE NUMBERS!
                        display_plate = "OCR UNRESOLVED"
                        plate_conf = 0.0
                        logger.info(f"[{cam_id.upper()}] CCTV quality degraded; plate unreadable. Zero dummy data emitted.")

                # Save raw and enhanced crops to disk for UI visualization
                live_dir = os.path.join(BASE_DIR, "assets", "live_frames")
                os.makedirs(live_dir, exist_ok=True)
                try:
                    cv2.imwrite(os.path.join(live_dir, f"{cam_id}.jpg"), frame)
                    cv2.imwrite(os.path.join(live_dir, f"crop_{cam_id}_raw.jpg"), bumper_roi)
                    cv2.imwrite(os.path.join(live_dir, f"crop_{cam_id}_enhanced.jpg"), enhanced_crop)
                except Exception:
                    pass

                # Check against active suspect watchlist only if plate is resolved
                if display_plate != "OCR UNRESOLVED":
                    assigned_vehicle_id = display_plate
                    norm_plate = re.sub(r'[^A-Z0-9]', '', display_plate).upper()
                    for target in active_suspect_plates:
                        ratio = difflib.SequenceMatcher(None, norm_plate, target).ratio()
                        if ratio >= 0.80 or target == norm_plate:
                            assigned_vehicle_id = target
                            logger.warning(f"🚨 [WATCHLIST HIT ON {cam_id.upper()}] Detected plate {display_plate} matches target {target}")
                            break
                else:
                    assigned_vehicle_id = f"VEH-{cls_name.upper()}-{cam_id.upper()}-{int(time.time()*10)%10000:04d}"

                # Post genuine telemetry with verified vehicle box and bumper plate box
                payload = {
                    "camera_id": cam_id,
                    "vehicle_id": assigned_vehicle_id,
                    "plate": display_plate,
                    "vehicle_type": cls_name,
                    "vehicle_label": display_label,
                    "confidence": round(plate_conf if display_plate != "OCR UNRESOLVED" else 0.0, 3),
                    "vehicle_confidence": round(conf, 3),
                    "bounding_box": [vx1, vy1, vx2, vy2],
                    "plate_box": list(plate_box),
                    "crop_url": f"/assets/live_frames/crop_{cam_id}_raw.jpg",
                    "enhanced_crop_url": f"/assets/live_frames/crop_{cam_id}_enhanced.jpg",
                    "snapshot_url": f"/assets/live_frames/{cam_id}.jpg",
                    "full_frame_url": f"/assets/live_frames/{cam_id}.jpg",
                    "enhancement_applied": enhancement_applied,
                    "enhancement_method": enhancement_method,
                    "quality_status": quality_meta.get("quality", "UNKNOWN"),
                    "source": "cctv_yolo_detector"
                }
                post_detection(payload)
                logger.info(f"[{cam_id.upper()}] Processed {display_label} plate={display_plate} (Enhancement: {enhancement_method or 'None'})")

                # Brief inter-camera breather
                time.sleep(1.0)

        except Exception as err:
            logger.error(f"Unexpected vision loop error: {err}")
            time.sleep(3)


if __name__ == "__main__":
    run_vision_engine()
