"""
Nirikshan Analytics Engine - Modular Vision AI Pipelines
=========================================================
- anpr_ocr.py: License Plate Detection + EasyOCR / PaddleOCR + VAHAN Bridge
- face_recognition.py: InsightFace (ArcFace) Face Matching + CCTNS / NAFIS Watchlist
- crowd_anomaly.py: ByteTrack Multi-Object Tracking, Crowd Surge & Reverse-Lane Detection
- threat_detector.py: Fine-tuned YOLO Weapon, Fire & Smoke Detection
"""
from .anpr_ocr import ANPRPipeline
from .face_recognition import FaceRecognitionPipeline
from .crowd_anomaly import CrowdAnomalyPipeline
from .threat_detector import ThreatDetectorPipeline

__all__ = [
    "ANPRPipeline",
    "FaceRecognitionPipeline",
    "CrowdAnomalyPipeline",
    "ThreatDetectorPipeline"
]
