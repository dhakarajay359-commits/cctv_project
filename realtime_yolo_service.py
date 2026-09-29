#!/usr/bin/env python3
"""
realtime_yolo_service.py
High-Performance Real-Time YOLOv8 Object Detection Micro-Daemon for Live CCTV Streams.
Keeps YOLO model loaded in RAM for ultra-fast (20-40ms) inference on live CCTV frames.
"""

import os
import sys
import json
import time
import base64
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

import cv2
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
YOLO_WEIGHTS = os.path.join(BASE_DIR, "yolov8n.pt")

try:
    from ultralytics import YOLO
    print(f"[YOLO-SERVICE] Loading YOLO model from {YOLO_WEIGHTS}...", flush=True)
    yolo_model = YOLO(YOLO_WEIGHTS)
    # Warm up inference
    dummy = np.zeros((360, 640, 3), dtype=np.uint8)
    _ = yolo_model(dummy, conf=0.15, classes=[0, 1, 2, 3, 5, 7], verbose=False)
    print("[YOLO-SERVICE] Model ready in memory.", flush=True)
except Exception as e:
    print(f"[YOLO-SERVICE] Failed to initialize YOLO: {e}", file=sys.stderr, flush=True)
    yolo_model = None


def refine_detection(cls_id, conf, bbox, frame_w, frame_h):
    x1, y1, x2, y2 = bbox
    bw = x2 - x1
    bh = y2 - y1
    ar = bw / float(max(1, bh))
    norm_w = bw / float(max(1, frame_w))
    norm_h = bh / float(max(1, frame_h))

    if cls_id == 0:
        return {
            "type": "PERSON (PEDESTRIAN)",
            "label": "PERSON (PEDESTRIAN)",
            "category": "person",
            "icon": "fa-person-walking"
        }
    elif cls_id == 1:
        return {
            "type": "BICYCLE",
            "label": "BICYCLE / CYCLIST",
            "category": "vehicle",
            "icon": "fa-bicycle"
        }
    elif cls_id == 3:
        return {
            "type": "TWO-WHEELER",
            "label": "TWO-WHEELER (MOTORCYCLE)",
            "category": "vehicle",
            "icon": "fa-motorcycle"
        }
    elif cls_id == 5:
        return {
            "type": "BUS",
            "label": "BUS (TRANSIT)",
            "category": "vehicle",
            "icon": "fa-bus"
        }
    elif cls_id == 7:
        # Check auto-rickshaw proportions under Indian road conditions
        if (0.58 <= ar <= 1.35) and norm_w < 0.25:
            return {
                "type": "AUTO RICKSHAW",
                "label": "AUTO RICKSHAW",
                "category": "vehicle",
                "icon": "fa-taxi"
            }
        return {
            "type": "TRUCK",
            "label": "TRUCK / COMMERCIAL",
            "category": "vehicle",
            "icon": "fa-truck"
        }
    else:  # cls_id == 2 (car)
        if ar < 1.38 and norm_h > 0.08:
            return {
                "type": "SUV",
                "label": "SUV (CROSSOVER)",
                "category": "vehicle",
                "icon": "fa-truck-pickup"
            }
        return {
            "type": "CAR (SEDAN)",
            "label": "CAR (SEDAN)",
            "category": "vehicle",
            "icon": "fa-car"
        }


def process_image(img, cam_id="cam01"):
    if img is None or img.size == 0 or yolo_model is None:
        return []

    h, w = img.shape[:2]
    # Run YOLO with classes: person (0), bicycle (1), car (2), motorcycle (3), bus (5), truck (7)
    res = yolo_model(img, conf=0.15, classes=[0, 1, 2, 3, 5, 7], verbose=False)

    detections = []
    if not res or len(res) == 0:
        return detections

    boxes = res[0].boxes
    if boxes is None or len(boxes) == 0:
        return detections

    for idx, b in enumerate(boxes):
        cls_id = int(b.cls[0].item())
        conf = float(b.conf[0].item())
        x1, y1, x2, y2 = [int(v) for v in b.xyxy[0].tolist()]

        # Filter out negligible noise
        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)
        if bw < 10 or bh < 12:
            continue

        refined = refine_detection(cls_id, conf, (x1, y1, x2, y2), w, h)

        # Convert to percentage bounding box
        left_pct = round(max(0.0, min(100.0, (x1 / float(w)) * 100.0)), 2)
        top_pct = round(max(0.0, min(100.0, (y1 / float(h)) * 100.0)), 2)
        width_pct = round(max(1.0, min(100.0, (bw / float(w)) * 100.0)), 2)
        height_pct = round(max(1.0, min(100.0, (bh / float(h)) * 100.0)), 2)

        detections.append({
            "id": f"yolo_{cam_id}_{refined['category']}_{idx + 1}",
            "type": refined["type"],
            "label": refined["label"],
            "category": refined["category"],
            "icon": refined["icon"],
            "confidence": round(conf, 3),
            "confidence_pct": f"{conf * 100:.1f}%",
            "hasPlate": False,
            "plate": "",
            "box": {
                "left": left_pct,
                "top": top_pct,
                "width": width_pct,
                "height": height_pct
            }
        })

    # Sort prominent detections first
    detections.sort(key=lambda d: d["box"]["width"] * d["box"]["height"], reverse=True)
    return detections


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class YoloRequestHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        cam_id = (params.get("camera_id", ["cam01"])[0]).lower()

        # Attempt to read live frame for this camera
        live_frame_path = os.path.join(BASE_DIR, "assets", "live_frames", f"{cam_id}.jpg")
        if not os.path.exists(live_frame_path):
            live_frame_path = os.path.join(BASE_DIR, "assets", "live_frames", "cam01.jpg")

        img = cv2.imread(live_frame_path) if os.path.exists(live_frame_path) else None
        detections = process_image(img, cam_id) if img is not None else []

        payload = {
            "status": "success",
            "source": "yolo_model_realtime",
            "camera_id": cam_id,
            "timestamp": time.time(),
            "count": len(detections),
            "detections": detections
        }

        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        raw_body = self.rfile.read(content_length)

        cam_id = "cam01"
        img = None

        try:
            if raw_body.startswith(b'{'):
                data = json.loads(raw_body.decode('utf-8'))
                cam_id = (data.get("camera_id", "cam01")).lower()
                img_data = data.get("frame") or data.get("image") or ""
                if "," in img_data:
                    img_data = img_data.split(",", 1)[1]
                if img_data:
                    nparr = np.frombuffer(base64.b64decode(img_data), np.uint8)
                    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            else:
                nparr = np.frombuffer(raw_body, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception as e:
            print(f"[YOLO-SERVICE] Decode error: {e}", flush=True)

        if img is None:
            # Fallback to current live frame on disk
            live_frame_path = os.path.join(BASE_DIR, "assets", "live_frames", f"{cam_id}.jpg")
            if os.path.exists(live_frame_path):
                img = cv2.imread(live_frame_path)

        detections = process_image(img, cam_id) if img is not None else []

        payload = {
            "status": "success",
            "source": "yolo_model_realtime",
            "camera_id": cam_id,
            "timestamp": time.time(),
            "count": len(detections),
            "detections": detections
        }

        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Silence verbose request logs to keep terminal clean
        pass


def run_server(port=10005):
    server_address = ('127.0.0.1', port)
    httpd = ThreadedHTTPServer(server_address, YoloRequestHandler)
    print(f"[YOLO-SERVICE] Real-time YOLOv8 micro-daemon active on http://127.0.0.1:{port}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 10005
    run_server(port)
