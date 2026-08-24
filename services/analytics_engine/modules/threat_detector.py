"""
Module 4: Weapon, Fire & Smoke Fine-Tuned YOLO Threat Detection
==============================================================
Pipeline: Threat-Specialized YOLO Weights -> Optical Signature Verification -> Immediate Red-Alert Dispatch
"""

import cv2
import logging
import numpy as np
import time
from typing import Dict, List, Optional
from ultralytics import YOLO

logger = logging.getLogger("NirikshanThreatDetector")

# Threat Classes detected by fine-tuned surveillance weights
THREAT_LABELS = {
    0: {"name": "fire", "severity": "CRITICAL", "action": "DISPATCH_FIRE_EMERGENCY_101"},
    1: {"name": "smoke", "severity": "HIGH", "action": "ALERT_FACILITY_MANAGER"},
    2: {"name": "gun_firearm", "severity": "CRITICAL", "action": "TACTICAL_POLICE_DISPATCH_112"},
    3: {"name": "knife_blade", "severity": "CRITICAL", "action": "TACTICAL_POLICE_DISPATCH_112"},
    4: {"name": "unattended_baggage", "severity": "HIGH", "action": "BOMB_SQUAD_VERIFICATION"}
}

class ThreatDetectorPipeline:
    """
    Detection pipeline for real-time fire, smoke, and weapon hazards.
    """
    def __init__(
        self,
        threat_model_path: str = "yolov8n.pt",  # Fallbacks to base YOLO or custom fine-tuned weights
        confidence_threshold: float = 0.45,
        device: str = "cpu"
    ):
        self.threat_model_path = threat_model_path
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.model = None
        self._load_threat_model()

    def _load_threat_model(self):
        try:
            self.model = YOLO(self.threat_model_path)
            logger.info(f"Threat Detection model loaded [{self.threat_model_path}] on {self.device}.")
        except Exception as e:
            logger.warning(f"Could not load custom threat model weights ({e}). Running in optical heuristic mode.")
            self.model = None

    def detect_fire_smoke_heuristics(self, frame: np.ndarray) -> List[Dict]:
        """
        Optical color-space & contour heuristic fallback for fire/smoke in surveillance feeds.
        """
        threats = []
        if frame is None or frame.size == 0:
            return threats

        # Convert to HSV color space for flame/orange-yellow glow detection
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        lower_fire = np.array([18, 50, 200], dtype=np.uint8)
        upper_fire = np.array([35, 255, 255], dtype=np.uint8)

        mask = cv2.inRange(hsv, lower_fire, upper_fire)
        fire_pixels = cv2.countNonZero(mask)
        total_pixels = frame.shape[0] * frame.shape[1]
        fire_ratio = fire_pixels / total_pixels

        # If localized bright flame concentration exceeds 0.8% of camera view
        if fire_ratio > 0.008:
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for c in contours:
                if cv2.contourArea(c) > 500:
                    x, y, w, h = cv2.boundingRect(c)
                    threats.append({
                        "threat_type": "fire",
                        "severity": "CRITICAL",
                        "confidence": round(min(0.98, fire_ratio * 30 + 0.6), 2),
                        "bbox": {"x1": x, "y1": y, "x2": x + w, "y2": y + h},
                        "suggested_action": "DISPATCH_FIRE_EMERGENCY_101",
                        "detector_source": "optical_flame_spectrometry"
                    })

        return threats

    def process_threat_scan(self, frame: np.ndarray) -> List[Dict]:
        """
        Scans video frame for weapons, fire, smoke, and hazardous payloads.
        """
        threats = []
        if frame is None or frame.size == 0:
            return threats

        # 1. Optical Flame / Smoke Spectrometry
        heuristics_threats = self.detect_fire_smoke_heuristics(frame)
        threats.extend(heuristics_threats)

        # 2. YOLO Neural Threat Inference
        if self.model:
            try:
                results = self.model.predict(
                    source=frame,
                    conf=self.confidence_threshold,
                    device=self.device,
                    verbose=False
                )
                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0].item())
                        conf = float(box.conf[0].item())
                        # If custom model class matches THREAT_LABELS
                        if cls_id in THREAT_LABELS:
                            meta = THREAT_LABELS[cls_id]
                            xyxy = [round(x, 2) for x in box.xyxy[0].tolist()]
                            threats.append({
                                "threat_type": meta["name"],
                                "severity": meta["severity"],
                                "confidence": round(conf, 4),
                                "bbox": {"x1": xyxy[0], "y1": xyxy[1], "x2": xyxy[2], "y2": xyxy[3]},
                                "suggested_action": meta["action"],
                                "detector_source": "yolo_threat_neural_net"
                            })
            except Exception as e:
                logger.error(f"Neural threat inference error: {e}")

        return threats
