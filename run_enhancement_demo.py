"""
run_enhancement_demo.py - Interactive CLI & Stream Runner for CCTV Enhancement Pipeline

Runs the CCTVEnhancer on:
- Live RTSP/ONVIF streams (`--rtsp rtsp://...`)
- USB/webcam feeds (`--cam 0`)
- Video files (`--file video.mp4`)
- Synthetic night CCTV generator with moving vehicle, glare, and sensor noise (`--synthetic`)

Features:
- Real-time keyboard toggles ('m' for Live/Review mode, 's' for evidentiary capture).
- Full forensic metadata/audit JSON export for court/evidentiary review.
- Headless video export mode (`--output enhanced.mp4`).
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
import cv2
import numpy as np
from cctv_enhancer import CCTVEnhancer, EnhancerConfig
from benchmark_enhancer import generate_benchmark_frame


def run_pipeline(
    source: str,
    mode: str = "live",
    output_video: str = "",
    max_frames: int = 0,
    save_audit_dir: str = "evidentiary_audits",
):
    Path(save_audit_dir).mkdir(parents=True, exist_ok=True)

    config = EnhancerConfig(
        mode=mode,
        buffer_size=12,
        gamma=1.8,
        clahe_clip_limit=2.0,
        enable_inpaint_bloom=False,
    )
    enhancer = CCTVEnhancer(config)

    # Initialize video capture
    is_synthetic = (source == "synthetic")
    cap = None
    if not is_synthetic:
        # Check if source is integer (webcam index)
        if source.isdigit():
            cap = cv2.VideoCapture(int(source))
        else:
            cap = cv2.VideoCapture(source)

        if not cap.isOpened():
            print(f"[ERROR] Failed to open video source: {source}")
            sys.exit(1)

    video_writer = None
    frame_idx = 0
    start_time = time.time()
    print("\n=======================================================")
    print("  NIRIKSHAN REAL-TIME CCTV ENHANCER - ACTIVE STREAM")
    print("=======================================================")
    print(f" Source: {source} | Initial Mode: {mode.upper()}")
    print(" Hotkeys:")
    print("   [M] Toggle Live / Review Mode")
    print("   [S] Snapshot Evidentiary Frame & Audit Record")
    print("   [G] Increment Gamma (+0.2) / [F] Decrement Gamma (-0.2)")
    print("   [Q] Quit")
    print("=======================================================\n")

    try:
        while True:
            if is_synthetic:
                raw_frame = generate_benchmark_frame(1280, 720, frame_idx)
                # Plate ROI follows moving vehicle
                offset = int((frame_idx * 12) % (1280 - 400))
                roi = (200 + offset + 80, 360 + 80, 100, 40)
            else:
                ret, raw_frame = cap.read()
                if not ret:
                    print("[INFO] Reached end of video source or feed disconnected.")
                    break
                roi = None  # Automatic central ROI

            # Process frame through 6-stage pipeline
            t_now = time.time()
            enhanced_stream, dashboard, metadata = enhancer.process_frame(
                raw_frame, roi=roi, timestamp=t_now
            )

            # Setup video writer if requested
            if output_video and video_writer is None:
                h_d, w_d = dashboard.shape[:2]
                fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                video_writer = cv2.VideoWriter(output_video, fourcc, 25.0, (w_d, h_d))

            if video_writer is not None:
                video_writer.write(dashboard)

            # Interactive display (if desktop window is supported)
            try:
                cv2.imshow("Nirikshan Forensic CCTV Enhancer", dashboard)
                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
                elif key == ord("m"):
                    new_mode = "review" if enhancer.config.mode == "live" else "live"
                    enhancer.set_mode(new_mode)
                elif key == ord("g"):
                    enhancer.update_gamma(min(3.0, enhancer.config.gamma + 0.2))
                    print(f"[CONTROL] Gamma updated to: {enhancer.config.gamma:.2f}")
                elif key == ord("f"):
                    enhancer.update_gamma(max(1.0, enhancer.config.gamma - 0.2))
                    print(f"[CONTROL] Gamma updated to: {enhancer.config.gamma:.2f}")
                elif key == ord("s"):
                    # Save snapshot and evidentiary metadata JSON
                    snap_id = f"ev_frame_{metadata.frame_id}_{int(time.time())}"
                    img_path = os.path.join(save_audit_dir, f"{snap_id}.png")
                    json_path = os.path.join(save_audit_dir, f"{snap_id}_audit.json")
                    cv2.imwrite(img_path, dashboard)
                    with open(json_path, "w", encoding="utf-8") as f:
                        json.dump(
                            {
                                "frame_id": metadata.frame_id,
                                "timestamp": metadata.timestamp,
                                "latencies_ms": metadata.stage_latencies_ms,
                                "audit_parameters": metadata.audit_log,
                                "config": {
                                    "mode": enhancer.config.mode,
                                    "gamma": enhancer.config.gamma,
                                    "clahe_clip": enhancer.config.clahe_clip_limit,
                                    "deblur_method": enhancer.config.deblur_method,
                                },
                            },
                            f,
                            indent=2,
                        )
                    print(f"[AUDIT] Snapshot and evidentiary JSON saved: {img_path}")
            except cv2.error:
                # Running in headless environment without display
                pass

            frame_idx += 1
            if frame_idx % 25 == 0:
                tot_ms = metadata.stage_latencies_ms.get("total", 0.0)
                fps = metadata.audit_log.get("effective_fps", 0.0)
                print(
                    f"Frame {frame_idx:4d} | Mode: {enhancer.config.mode.upper():<6} | "
                    f"Latency: {tot_ms:5.1f}ms ({fps:4.1f} FPS) | "
                    f"PSF: {metadata.audit_log.get('psf_estimated_length', 0):4.1f}px "
                    f"@{metadata.audit_log.get('psf_estimated_angle_deg', 0):4.1f}deg"
                )

            if max_frames > 0 and frame_idx >= max_frames:
                break

    finally:
        if cap is not None:
            cap.release()
        if video_writer is not None:
            video_writer.release()
            print(f"[INFO] Enhanced output video exported to: {output_video}")
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass

    elapsed = time.time() - start_time
    avg_fps = frame_idx / max(elapsed, 1e-3)
    print(f"\n[DONE] Processed {frame_idx} frames in {elapsed:.2f}s (Average: {avg_fps:.1f} FPS).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Nirikshan CCTV Enhancement Pipeline")
    parser.add_argument(
        "--source",
        type=str,
        default="synthetic",
        help="Input source: 'synthetic', webcam index (e.g. '0'), video file path, or RTSP URL",
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["live", "review"],
        default="live",
        help="Pipeline processing mode",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="",
        help="Optional path to output MP4 video (e.g. enhanced.mp4)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=60,
        help="Maximum frames to process (0 for infinite/until stream ends)",
    )
    args = parser.parse_args()

    run_pipeline(
        source=args.source,
        mode=args.mode,
        output_video=args.output,
        max_frames=args.max_frames,
    )
