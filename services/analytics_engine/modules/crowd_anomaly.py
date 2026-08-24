"""
Module 3: Crowd Surge, Multi-Object Tracking (ByteTrack) & Trajectory Anomaly
=============================================================================
Pipeline: YOLO Person/Vehicle Detections -> Tracklet History -> Density & Flow Vectors -> Anomaly Alerts
"""

import logging
import math
import numpy as np
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("NirikshanCrowdAnomaly")

class ByteTracklet:
    """Represents a single tracked object across video frames."""
    def __init__(self, track_id: int, bbox: Dict, class_name: str):
        self.track_id = track_id
        self.class_name = class_name
        self.positions: List[Tuple[float, float, float]] = []  # (cx, cy, timestamp)
        self.misses = 0
        self.update(bbox)

    def get_centroid(self, bbox: Dict) -> Tuple[float, float]:
        cx = (bbox["x1"] + bbox["x2"]) / 2.0
        cy = (bbox["y1"] + bbox["y2"]) / 2.0
        return (cx, cy)

    def update(self, bbox: Dict):
        cx, cy = self.get_centroid(bbox)
        self.positions.append((cx, cy, time.time()))
        if len(self.positions) > 30:  # Keep last 30 positions (approx 1-2 sec trail)
            self.positions.pop(0)
        self.current_bbox = bbox
        self.misses = 0

    def get_velocity_vector(self) -> Tuple[float, float, float]:
        """Calculates (vx, vy, speed_px_sec) based on recent positions."""
        if len(self.positions) < 2:
            return (0.0, 0.0, 0.0)
        p1 = self.positions[0]
        p2 = self.positions[-1]
        dt = max(0.01, p2[2] - p1[2])
        vx = (p2[0] - p1[0]) / dt
        vy = (p2[1] - p1[1]) / dt
        speed = math.sqrt(vx**2 + vy**2)
        return (round(vx, 2), round(vy, 2), round(speed, 2))


class CrowdAnomalyPipeline:
    """
    Tracks crowd density, multi-object flow vectors, and anomalous behavior
    (e.g., stampede surge, reverse-lane vehicle transit, abnormal loitering).
    """
    def __init__(
        self,
        crowd_surge_threshold: int = 15,    # Persons in sector before triggering surge alarm
        speed_anomaly_threshold: float = 250.0, # Pixels/sec indicating panic running or speeding
        expected_lane_direction: str = "DOWN"   # Expected vehicle flow: UP, DOWN, LEFT, RIGHT
    ):
        self.crowd_surge_threshold = crowd_surge_threshold
        self.speed_anomaly_threshold = speed_anomaly_threshold
        self.expected_lane_direction = expected_lane_direction
        self.next_track_id = 1
        self.tracklets: Dict[int, ByteTracklet] = {}
        self.max_match_distance = 80.0  # Max pixel distance between frames to match tracklet

    def _match_detections_to_tracks(self, detections: List[Dict]):
        """Simple greedy distance-based matching (emulating ByteTrack Kalman Association)."""
        det_centroids = []
        for det in detections:
            bbox = det["bbox"]
            cx = (bbox["x1"] + bbox["x2"]) / 2.0
            cy = (bbox["y1"] + bbox["y2"]) / 2.0
            det_centroids.append((cx, cy, det))

        matched_tracks = set()
        unmatched_dets = list(range(len(det_centroids)))

        for track_id, track in list(self.tracklets.items()):
            if not track.positions:
                continue
            tcx, tcy, _ = track.positions[-1]
            best_det_idx = None
            min_dist = float("inf")

            for idx in unmatched_dets:
                dcx, dcy, _ = det_centroids[idx]
                dist = math.hypot(dcx - tcx, dcy - tcy)
                if dist < min_dist and dist <= self.max_match_distance:
                    min_dist = dist
                    best_det_idx = idx

            if best_det_idx is not None:
                track.update(det_centroids[best_det_idx][2]["bbox"])
                matched_tracks.add(track_id)
                unmatched_dets.remove(best_det_idx)
            else:
                track.misses += 1
                if track.misses > 10:  # Expire track after 10 dropped frames
                    del self.tracklets[track_id]

        # Create new tracklets for unmatched detections
        for idx in unmatched_dets:
            det = det_centroids[idx][2]
            new_track = ByteTracklet(self.next_track_id, det["bbox"], det.get("class_name", "object"))
            self.tracklets[self.next_track_id] = new_track
            self.next_track_id += 1

    def process_frame_tracking(
        self,
        person_detections: List[Dict],
        vehicle_detections: List[Dict]
    ) -> Dict:
        """
        Executes multi-object tracking, calculates crowd density, and detects anomalies.
        """
        all_detections = person_detections + vehicle_detections
        self._match_detections_to_tracks(all_detections)

        person_count = len(person_detections)
        vehicle_count = len(vehicle_detections)

        anomalies = []

        # 1. Crowd Surge / Stampede Check
        if person_count >= self.crowd_surge_threshold:
            anomalies.append({
                "type": "CROWD_SURGE_DETECTED",
                "severity": "CRITICAL" if person_count > self.crowd_surge_threshold * 1.5 else "HIGH",
                "person_density_count": person_count,
                "threshold": self.crowd_surge_threshold,
                "message": f"Critical crowd density spike ({person_count} persons in surveillance zone)."
            })

        # 2. Reverse-Lane Driving & Panic Velocity Check
        for track_id, track in self.tracklets.items():
            vx, vy, speed = track.get_velocity_vector()

            # Speed anomaly (Panic running / High-speed vehicle in restricted corridor)
            if speed > self.speed_anomaly_threshold and len(track.positions) >= 5:
                anomalies.append({
                    "type": "HIGH_VELOCITY_ANOMALY",
                    "severity": "MEDIUM",
                    "track_id": track_id,
                    "object_type": track.class_name,
                    "speed_px_sec": speed,
                    "message": f"Abnormal high speed ({speed} px/s) detected for {track.class_name} ID #{track_id}."
                })

            # Reverse-Lane driving (e.g., flow expected DOWN, but vehicle moving UP with strong vy < -30)
            if track.class_name in ["car", "bus", "truck", "motorcycle"] and len(track.positions) >= 6:
                if self.expected_lane_direction == "DOWN" and vy < -35.0:
                    anomalies.append({
                        "type": "WRONG_WAY_REVERSE_LANE",
                        "severity": "CRITICAL",
                        "track_id": track_id,
                        "vehicle_type": track.class_name,
                        "vector": {"vx": vx, "vy": vy},
                        "message": f"Wrong-way vehicle violation: {track.class_name} ID #{track_id} moving against traffic flow."
                    })

        return {
            "active_tracks_count": len(self.tracklets),
            "person_count": person_count,
            "vehicle_count": vehicle_count,
            "has_anomalies": len(anomalies) > 0,
            "anomalies": anomalies,
            "timestamp": time.time()
        }
