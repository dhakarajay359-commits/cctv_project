"""
Module 2: Face Recognition & CCTNS/NAFIS Watchlist Matching
===========================================================
Pipeline: Face Detection & Alignment -> ArcFace / InsightFace 512-d Embeddings -> 1:N Vector Cosine Search
"""

import cv2
import logging
import numpy as np
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("NirikshanFaceRec")

# Preloaded CCTNS / NAFIS Gujarat Criminal Watchlist Signatures for Cross-Matching
MOCK_CCTNS_WATCHLIST = [
    {
        "suspect_id": "SUSP-GJ-2024-8819",
        "full_name": "Vikram Ramsinh Solanki",
        "alias": "Vicky Sanand",
        "cctns_fir_no": "FIR-104/2024-SANAND",
        "offense_category": "Extortion & Inter-District Armed Robbery",
        "risk_level": "HIGH",
        "embedding": np.random.RandomState(42).randn(512).astype(np.float32)  # Normalized 512-d feature vector
    },
    {
        "suspect_id": "SUSP-GJ-2023-4102",
        "full_name": "Mustafa Ismail Sheikh",
        "alias": "Bhaijaan",
        "cctns_fir_no": "FIR-512/2023-JAMNAGAR-PORT",
        "offense_category": "Contraband Smuggling & Customs Evasion",
        "risk_level": "CRITICAL",
        "embedding": np.random.RandomState(99).randn(512).astype(np.float32)
    },
    {
        "suspect_id": "SUSP-GJ-2025-0012",
        "full_name": "Pravin Khimji Patel",
        "alias": "PK Toll",
        "cctns_fir_no": "FIR-33/2025-DAHOD-BORDER",
        "offense_category": "Illegal Interstate Grain Siphoning",
        "risk_level": "MEDIUM",
        "embedding": np.random.RandomState(7).randn(512).astype(np.float32)
    }
]

# Normalize reference embeddings to unit sphere
for item in MOCK_CCTNS_WATCHLIST:
    norm = np.linalg.norm(item["embedding"])
    if norm > 0:
        item["embedding"] = item["embedding"] / norm

class FaceRecognitionPipeline:
    """
    Face Recognition & 1:N Watchlist matching with ArcFace embeddings & Cosine Metric.
    """
    def __init__(self, match_threshold: float = 0.65, use_gpu: bool = False):
        self.match_threshold = match_threshold
        self.use_gpu = use_gpu
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.watchlist = MOCK_CCTNS_WATCHLIST
        logger.info(f"Face Recognition Pipeline initialized. Loaded {len(self.watchlist)} CCTNS watchlist entries.")

    def detect_faces(self, frame: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """
        Detects faces in frame and returns list of (x, y, w, h).
        """
        if frame is None or frame.size == 0:
            return []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        return [(int(x), int(y), int(w), int(h)) for (x, y, w, h) in faces]

    def extract_face_embedding(self, face_crop: np.ndarray) -> np.ndarray:
        """
        Generates 512-dimensional ArcFace/InsightFace feature vector.
        """
        if face_crop is None or face_crop.size == 0:
            return np.zeros(512, dtype=np.float32)

        # Standard InsightFace preprocessing: 112x112 RGB normalized
        resized = cv2.resize(face_crop, (112, 112))
        normalized = (resized.astype(np.float32) - 127.5) / 128.0

        # Pseudo-deterministic embedding simulation for consistent identity matching across frames
        seed = int(np.sum(normalized * 1000)) % (2**31 - 1)
        embedding = np.random.RandomState(abs(seed)).randn(512).astype(np.float32)
        norm = np.linalg.norm(embedding)
        return embedding / (norm if norm > 0 else 1.0)

    def match_against_cctns(self, embedding: np.ndarray) -> Optional[Dict]:
        """
        Calculates Cosine Similarity against all watchlist records.
        """
        best_match = None
        best_similarity = -1.0

        for record in self.watchlist:
            # Cosine similarity: dot product of normalized vectors
            sim = float(np.dot(embedding, record["embedding"]))
            if sim > best_similarity:
                best_similarity = sim
                best_match = record

        if best_similarity >= self.match_threshold and best_match:
            return {
                "is_match": True,
                "similarity_score": round(best_similarity, 4),
                "suspect_id": best_match["suspect_id"],
                "full_name": best_match["full_name"],
                "alias": best_match["alias"],
                "cctns_fir_no": best_match["cctns_fir_no"],
                "offense_category": best_match["offense_category"],
                "risk_level": best_match["risk_level"],
                "alert_priority": "CRITICAL" if best_match["risk_level"] == "CRITICAL" else "HIGH"
            }

        return {
            "is_match": False,
            "similarity_score": round(max(0.0, best_similarity), 4),
            "suspect_id": None
        }

    def process_frame(self, frame: np.ndarray, person_boxes: Optional[List[Dict]] = None) -> List[Dict]:
        """
        Scans frame or person ROI crops for faces and performs CCTNS cross-matching.
        """
        results = []
        h, w = frame.shape[:2]

        # 1. If person bounding boxes are provided from YOLO, focus on upper head region
        if person_boxes:
            for p in person_boxes:
                bbox = p.get("bbox", {})
                px1 = max(0, int(bbox.get("x1", 0)))
                py1 = max(0, int(bbox.get("y1", 0)))
                px2 = min(w, int(bbox.get("x2", 0)))
                # Upper 40% is head region
                py2 = min(h, int(py1 + (bbox.get("y2", 0) - py1) * 0.4))

                if px2 > px1 and py2 > py1:
                    head_crop = frame[py1:py2, px1:px2]
                    detected_faces = self.detect_faces(head_crop)
                    for (fx, fy, fw, fh) in detected_faces:
                        face_crop = head_crop[fy:fy+fh, fx:fx+fw]
                        emb = self.extract_face_embedding(face_crop)
                        match_info = self.match_against_cctns(emb)
                        results.append({
                            "face_bbox": {"x1": px1 + fx, "y1": py1 + fy, "x2": px1 + fx + fw, "y2": py1 + fy + fh},
                            "match": match_info,
                            "timestamp": time.time()
                        })
        else:
            # Direct full-frame face search
            detected_faces = self.detect_faces(frame)
            for (fx, fy, fw, fh) in detected_faces:
                face_crop = frame[fy:fy+fh, fx:fx+fw]
                emb = self.extract_face_embedding(face_crop)
                match_info = self.match_against_cctns(emb)
                results.append({
                    "face_bbox": {"x1": fx, "y1": fy, "x2": fx + fw, "y2": fy + fh},
                    "match": match_info,
                    "timestamp": time.time()
                })

        return results
