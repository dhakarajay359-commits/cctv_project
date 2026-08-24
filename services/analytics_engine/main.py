"""
Nirikshan Layer 3 Vision Analytics Engine - FastAPI Microservice
===============================================================
Exposes dedicated endpoints for:
  - Phase 1: ANPR & License Plate OCR (/analytics/anpr/scan)
  - Phase 2: Face Recognition & CCTNS Watchlist (/analytics/face/match)
  - Phase 3: Crowd Density & Anomaly Tracking (/analytics/crowd/analyze)
  - Phase 4: Weapon, Fire & Smoke Detection (/analytics/threat/scan)
  - Stream Orchestration (/streams/start, /streams/stop, /streams/active)
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field
from typing import Dict, List, Optional
import cv2
import numpy as np
import os
import uvicorn

from .detector import NirikshanStreamDetector
from .modules.anpr_ocr import ANPRPipeline
from .modules.face_recognition import FaceRecognitionPipeline
from .modules.crowd_anomaly import CrowdAnomalyPipeline
from .modules.threat_detector import ThreatDetectorPipeline

app = FastAPI(
    title="Nirikshan Layer 3 Vision Analytics Engine",
    description="Production Microservice for ANPR OCR, ArcFace Facial Matching, ByteTrack Crowd Anomaly, and Threat Detection.",
    version="2.4.0"
)

# Active camera detector instances: { camera_id: NirikshanStreamDetector }
active_detectors: Dict[str, NirikshanStreamDetector] = {}

# Standalone pipeline singletons for ad-hoc REST inference
anpr_service = ANPRPipeline()
face_service = FaceRecognitionPipeline()
crowd_service = CrowdAnomalyPipeline()
threat_service = ThreatDetectorPipeline()

class StreamStartRequest(BaseModel):
    camera_id: str = Field(..., example="CAM-GJ-0101")
    rtsp_url: str = Field(..., example="rtsp://localhost:8554/stream/1")
    confidence_threshold: float = Field(0.5, ge=0.1, le=1.0)
    frame_sample_rate: int = Field(5, ge=1, le=30, description="Inference every N frames")
    enable_anpr: bool = True
    enable_face_rec: bool = True
    enable_crowd_surge: bool = True
    enable_threat_detection: bool = True

class StreamStopRequest(BaseModel):
    camera_id: str = Field(..., example="CAM-GJ-0101")

def _read_image_upload(file_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(file_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Invalid image file format")
    return frame

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "nirikshan-analytics-engine",
        "layer": "L3",
        "active_camera_streams": len(active_detectors),
        "modules_loaded": [
            "ANPR_EasyOCR_PaddleOCR",
            "ArcFace_CCTNS_Watchlist",
            "ByteTrack_Crowd_Surge",
            "Weapon_Fire_Smoke_YOLO"
        ]
    }

# =========================================================================
# SECTION 1: ANPR & NUMBER PLATE OCR ENDPOINTS
# =========================================================================
@app.post("/analytics/anpr/scan")
async def scan_number_plate(file: UploadFile = File(...)):
    """Runs high-precision OCR on vehicle license plate crop or full frame."""
    contents = await file.read()
    frame = _read_image_upload(contents)
    result = anpr_service.extract_plate_text(frame)
    return {
        "module": "ANPR_OCR",
        "result": result
    }

# =========================================================================
# SECTION 2: FACE RECOGNITION & CCTNS MATCHING ENDPOINTS
# =========================================================================
@app.post("/analytics/face/match")
async def match_face_watchlist(file: UploadFile = File(...)):
    """Extracts ArcFace embedding from face crop and checks against CCTNS/NAFIS watchlist."""
    contents = await file.read()
    frame = _read_image_upload(contents)
    matches = face_service.process_frame(frame)
    return {
        "module": "FACE_RECOGNITION_CCTNS",
        "total_faces": len(matches),
        "matches": matches
    }

# =========================================================================
# SECTION 3: CROWD SURGE & ANOMALY TRACKING ENDPOINTS
# =========================================================================
@app.post("/analytics/crowd/analyze")
def analyze_crowd(
    person_count: int = Query(..., description="Estimated person count in sector"),
    expected_lane_flow: str = Query("DOWN", description="Expected traffic flow direction")
):
    """Evaluates density surge metrics and flow vector rules."""
    crowd_pipeline = CrowdAnomalyPipeline(expected_lane_direction=expected_lane_flow)
    # Simulate assessment
    has_surge = person_count >= crowd_pipeline.crowd_surge_threshold
    return {
        "module": "CROWD_ANOMALY_BYTETRACK",
        "person_count": person_count,
        "surge_threshold": crowd_pipeline.crowd_surge_threshold,
        "is_surge_alert": has_surge,
        "severity": "CRITICAL" if person_count > crowd_pipeline.crowd_surge_threshold * 1.5 else ("HIGH" if has_surge else "NORMAL")
    }

# =========================================================================
# SECTION 4: WEAPON, FIRE & SMOKE DETECTION ENDPOINTS
# =========================================================================
@app.post("/analytics/threat/scan")
async def scan_threats(file: UploadFile = File(...)):
    """Scans frame for weapon hazards, flames, and smoke plumes."""
    contents = await file.read()
    frame = _read_image_upload(contents)
    threats = threat_service.process_threat_scan(frame)
    return {
        "module": "WEAPON_FIRE_SMOKE_DETECTION",
        "threats_detected": len(threats),
        "threat_dossiers": threats
    }

# =========================================================================
# COMPOSITE STREAM ORCHESTRATION ENDPOINTS
# =========================================================================
@app.get("/streams/active")
def get_active_streams():
    return {
        "active_count": len(active_detectors),
        "cameras": [
            {
                "camera_id": cid,
                "rtsp_url": det.rtsp_url,
                "is_running": det.is_running,
                "modules_enabled": {
                    "anpr": det.enable_anpr,
                    "face_rec": det.enable_face_rec,
                    "crowd_surge": det.enable_crowd_surge,
                    "threats": det.enable_threat_detection
                }
            }
            for cid, det in active_detectors.items()
        ]
    }

@app.post("/streams/start")
def start_stream_inference(req: StreamStartRequest):
    if req.camera_id in active_detectors and active_detectors[req.camera_id].is_running:
        return {"message": f"Camera stream [{req.camera_id}] is already running.", "status": "active"}

    detector = NirikshanStreamDetector(
        camera_id=req.camera_id,
        rtsp_url=req.rtsp_url,
        confidence_threshold=req.confidence_threshold,
        frame_sample_rate=req.frame_sample_rate,
        enable_anpr=req.enable_anpr,
        enable_face_rec=req.enable_face_rec,
        enable_crowd_surge=req.enable_crowd_surge,
        enable_threat_detection=req.enable_threat_detection,
        kafka_topic=os.getenv("KAFKA_DETECTION_TOPIC", "gujarat.vision.inferences"),
        device=os.getenv("INFERENCE_DEVICE", "cpu")
    )
    detector.start()
    active_detectors[req.camera_id] = detector

    return {
        "status": "started",
        "camera_id": req.camera_id,
        "rtsp_url": req.rtsp_url,
        "kafka_topic": detector.kafka_topic
    }

@app.post("/streams/stop")
def stop_stream_inference(req: StreamStopRequest):
    if req.camera_id not in active_detectors:
        raise HTTPException(status_code=404, detail=f"No active stream found for camera [{req.camera_id}]")

    detector = active_detectors.pop(req.camera_id)
    detector.stop()
    return {"status": "stopped", "camera_id": req.camera_id}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8004))
    uvicorn.run("services.analytics_engine.main:app", host="0.0.0.0", port=port, reload=False)
