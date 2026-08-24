"""
Nirikshan Layer 3 Vision Analytics Engine - Unified Stream Orchestrator
========================================================================
Coordinates:
  1. Base YOLOv8 Object & Vehicle Stream Detection
  2. Module 1: ANPR & License Plate Optical Character Recognition
  3. Module 2: Face Recognition & CCTNS 1:N Watchlist Cross-Matching
  4. Module 3: Crowd Surge, ByteTrack Multi-Object Tracking & Anomaly Detection
  5. Module 4: Weapon, Fire & Smoke Fine-Tuned Threat Detection
"""

import cv2
import logging
import os
import threading
import time
from typing import Dict, List, Optional
import requests
from ultralytics import YOLO

from .kafka_producer import AlertBusPublisher
from .modules.anpr_ocr import ANPRPipeline
from .modules.face_recognition import FaceRecognitionPipeline
from .modules.crowd_anomaly import CrowdAnomalyPipeline
from .modules.threat_detector import ThreatDetectorPipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("NirikshanStreamDetector")

# COCO Class mapping for surveillance objects
CLASS_NAMES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck"
}

class NirikshanStreamDetector:
    """
    Unified multi-pipeline camera stream detector with fine-grained toggles per feature.
    """
    def __init__(
        self,
        camera_id: str = "CAM-GJ-0101",
        rtsp_url: str = "rtsp://localhost:8554/stream/1",
        model_weights: str = "yolov8n.pt",
        kafka_topic: str = "gujarat.vision.inferences",
        api_callback_url: Optional[str] = "http://localhost:8080/api/analytics/anpr",
        confidence_threshold: float = 0.5,
        target_classes: Optional[List[int]] = None,
        frame_sample_rate: int = 5,
        device: str = "cpu",
        # Feature Toggles
        enable_anpr: bool = True,
        enable_face_rec: bool = True,
        enable_crowd_surge: bool = True,
        enable_threat_detection: bool = True
    ):
        self.camera_id = camera_id
        self.rtsp_url = rtsp_url
        self.model_weights = model_weights
        self.kafka_topic = kafka_topic
        self.api_callback_url = api_callback_url
        self.confidence_threshold = confidence_threshold
        self.target_classes = target_classes or [0, 1, 2, 3, 5, 7]
        self.frame_sample_rate = frame_sample_rate
        self.device = device

        self.enable_anpr = enable_anpr
        self.enable_face_rec = enable_face_rec
        self.enable_crowd_surge = enable_crowd_surge
        self.enable_threat_detection = enable_threat_detection

        self.is_running = False
        self.thread: Optional[threading.Thread] = None
        self.model = None
        self.publisher = AlertBusPublisher()

        # Initialize Specialized Analytics Submodules
        self.anpr_pipeline = ANPRPipeline(use_gpu=(device != "cpu")) if enable_anpr else None
        self.face_pipeline = FaceRecognitionPipeline(use_gpu=(device != "cpu")) if enable_face_rec else None
        self.crowd_pipeline = CrowdAnomalyPipeline() if enable_crowd_surge else None
        self.threat_pipeline = ThreatDetectorPipeline(device=device) if enable_threat_detection else None

        self._load_model()

    def _load_model(self):
        """Loads YOLOv8 weights on configured device."""
        logger.info(f"Loading base YOLO model [{self.model_weights}] on device [{self.device}]...")
        try:
            self.model = YOLO(self.model_weights)
            logger.info(f"YOLO model [{self.model_weights}] loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise

    def process_frame(self, frame, frame_idx: int = 0) -> Dict:
        """
        Runs comprehensive multi-pipeline inference on a single frame.
        """
        if self.model is None or frame is None or frame.size == 0:
            return {}

        # 1. Base YOLO Inference
        results = self.model.predict(
            source=frame,
            conf=self.confidence_threshold,
            classes=self.target_classes,
            device=self.device,
            verbose=False
        )

        person_detections = []
        vehicle_detections = []

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0].item())
                conf = float(box.conf[0].item())
                xyxy = [round(x, 2) for x in box.xyxy[0].tolist()]
                class_name = CLASS_NAMES.get(cls_id, f"class_{cls_id}")

                item = {
                    "class_id": cls_id,
                    "class_name": class_name,
                    "confidence": round(conf, 4),
                    "bbox": {"x1": xyxy[0], "y1": xyxy[1], "x2": xyxy[2], "y2": xyxy[3]}
                }

                if cls_id == 0:
                    person_detections.append(item)
                elif cls_id in [1, 2, 3, 5, 7]:
                    vehicle_detections.append(item)

        # 2. Module 1: ANPR Number Plate OCR (if vehicles detected)
        anpr_results = []
        if self.enable_anpr and self.anpr_pipeline and vehicle_detections:
            anpr_results = self.anpr_pipeline.process_vehicle_detections(frame, vehicle_detections)

        # 3. Module 2: Face Recognition & CCTNS Watchlist Matching (if persons detected)
        face_matches = []
        if self.enable_face_rec and self.face_pipeline and person_detections:
            face_matches = self.face_pipeline.process_frame(frame, person_detections)

        # 4. Module 3: Crowd Surge, ByteTrack & Anomaly Tracking
        crowd_analytics = {}
        if self.enable_crowd_surge and self.crowd_pipeline:
            crowd_analytics = self.crowd_pipeline.process_frame_tracking(person_detections, vehicle_detections)

        # 5. Module 4: Weapon, Fire & Smoke Detection
        threat_results = []
        if self.enable_threat_detection and self.threat_pipeline:
            threat_results = self.threat_pipeline.process_threat_scan(frame)

        return {
            "camera_id": self.camera_id,
            "timestamp": time.time(),
            "frame_idx": frame_idx,
            "objects_summary": {
                "persons": len(person_detections),
                "vehicles": len(vehicle_detections),
                "anpr_plates": len(anpr_results),
                "face_searches": len(face_matches),
                "threats": len(threat_results)
            },
            "detections": {
                "persons": person_detections,
                "vehicles": vehicle_detections,
                "anpr_events": anpr_results,
                "facial_watchlist_matches": [f for f in face_matches if f.get("match", {}).get("is_match")],
                "crowd_anomaly": crowd_analytics,
                "threats": threat_results
            }
        }

    def _stream_loop(self):
        """
        Continuous ingestion loop for camera RTSP feed.
        """
        logger.info(f"Starting multi-pipeline capture for Camera [{self.camera_id}] at: {self.rtsp_url}")
        cap = cv2.VideoCapture(self.rtsp_url)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        frame_count = 0
        reconnect_attempts = 0

        while self.is_running:
            if not cap.isOpened():
                reconnect_attempts += 1
                logger.warning(f"Stream disconnected for [{self.camera_id}]. Reconnect attempt #{reconnect_attempts} in 3s...")
                time.sleep(3)
                cap = cv2.VideoCapture(self.rtsp_url)
                continue

            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.5)
                continue

            frame_count += 1
            if frame_count % self.frame_sample_rate != 0:
                continue

            try:
                inference_payload = self.process_frame(frame, frame_idx=frame_count)

                # Check if any significant event occurred (detections, alerts, watchlist matches, threats)
                summary = inference_payload.get("objects_summary", {})
                has_events = (
                    summary.get("persons", 0) > 0 or
                    summary.get("vehicles", 0) > 0 or
                    summary.get("threats", 0) > 0 or
                    inference_payload.get("detections", {}).get("crowd_anomaly", {}).get("has_anomalies", False)
                )

                if has_events:
                    # Route detections to Kafka event bus
                    self.publisher.publish_detection_event(
                        topic=self.kafka_topic,
                        payload=inference_payload,
                        key=self.camera_id
                    )

                    # Optional REST callback
                    if self.api_callback_url:
                        self._dispatch_rest_alert(inference_payload)

            except Exception as e:
                logger.error(f"Inference error on frame #{frame_count} for [{self.camera_id}]: {e}")

        cap.release()
        logger.info(f"Stream loop terminated for Camera [{self.camera_id}].")

    def _dispatch_rest_alert(self, payload: dict):
        try:
            requests.post(self.api_callback_url, json=payload, timeout=0.8)
        except Exception:
            pass

    def start(self):
        if not self.is_running:
            self.is_running = True
            self.thread = threading.Thread(target=self._stream_loop, daemon=True)
            self.thread.start()
            logger.info(f"Multi-pipeline detection worker started for Camera [{self.camera_id}].")

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        self.publisher.close()
        logger.info(f"Detection worker stopped for Camera [{self.camera_id}].")
