#!/usr/bin/env python3
"""
Standalone Execution Script for Nirikshan Multi-Pipeline YOLO Detection
========================================================================
Usage:
    python run_standalone_detector.py --source rtsp://admin:password@192.168.1.100:554/live --camera CAM-GJ-0101
    python run_standalone_detector.py --source 0 --no-face --no-threats  # for webcam with ANPR & Crowd only
"""

import argparse
import sys
import os

# Ensure package path is accessible
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from services.analytics_engine.detector import NirikshanStreamDetector

def main():
    parser = argparse.ArgumentParser(description="Nirikshan Layer 3 Vision Stream Detection Runner")
    parser.add_argument("--source", type=str, default="rtsp://localhost:8554/stream/1", help="RTSP URL, video file path, or webcam index (0)")
    parser.add_argument("--camera", type=str, default="CAM-GJ-0101", help="Camera Node ID")
    parser.add_argument("--weights", type=str, default="yolov8n.pt", help="YOLO model weights file")
    parser.add_argument("--conf", type=float, default=0.5, help="Confidence threshold")
    parser.add_argument("--sample-rate", type=int, default=3, help="Inference frame sampling rate")
    parser.add_argument("--kafka-topic", type=str, default="gujarat.vision.inferences", help="Kafka alert topic")
    parser.add_argument("--device", type=str, default="cpu", help="Device (cpu, cuda:0, mps)")
    
    # Feature flags
    parser.add_argument("--no-anpr", action="store_true", help="Disable ANPR plate OCR module")
    parser.add_argument("--no-face", action="store_true", help="Disable Face Recognition module")
    parser.add_argument("--no-crowd", action="store_true", help="Disable Crowd Anomaly module")
    parser.add_argument("--no-threats", action="store_true", help="Disable Weapon/Fire/Smoke module")

    args = parser.parse_args()

    source = int(args.source) if args.source.isdigit() else args.source

    print("=" * 75)
    print(" NIRIKSHAN STATE CCTV INTELLIGENCE — LAYER 3 MULTI-PIPELINE VISION ENGINE ")
    print("=" * 75)
    print(f" Camera ID          : {args.camera}")
    print(f" Stream Source      : {args.source}")
    print(f" Model Weights      : {args.weights}")
    print(f" Kafka Topic        : {args.kafka_topic}")
    print(f" Sample Rate        : Every {args.sample_rate} frames")
    print(f" [M1] ANPR OCR      : {'DISABLED' if args.no_anpr else 'ACTIVE (EasyOCR/PaddleOCR + YOLO)'}")
    print(f" [M2] Face Matching : {'DISABLED' if args.no_face else 'ACTIVE (ArcFace 512-d + CCTNS)'}")
    print(f" [M3] Crowd Anomaly : {'DISABLED' if args.no_crowd else 'ACTIVE (ByteTrack MOT + Surge)'}")
    print(f" [M4] Threat Detect : {'DISABLED' if args.no_threats else 'ACTIVE (Weapon, Fire & Smoke)'}")
    print("=" * 75)

    detector = NirikshanStreamDetector(
        camera_id=args.camera,
        rtsp_url=source,
        model_weights=args.weights,
        kafka_topic=args.kafka_topic,
        confidence_threshold=args.conf,
        frame_sample_rate=args.sample_rate,
        device=args.device,
        enable_anpr=not args.no_anpr,
        enable_face_rec=not args.no_face,
        enable_crowd_surge=not args.no_crowd,
        enable_threat_detection=not args.no_threats
    )

    try:
        detector._stream_loop()
    except KeyboardInterrupt:
        print("\n[!] Stopping detector safely...")
        detector.stop()

if __name__ == "__main__":
    main()
