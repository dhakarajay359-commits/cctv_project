"""
benchmark_enhancer.py - Latency & Throughput Benchmark for CCTV Enhancement Pipeline

Measures per-stage latency (Ingest, Glare, Denoise, Deblur, Stacking, Composite/Audit)
across multiple resolutions (720p, 1080p) and modes ('live' vs. 'review').
Flags whether each configuration meets target source FPS.
"""

import argparse
import time
import numpy as np
import cv2
from typing import Dict, List
from cctv_enhancer import CCTVEnhancer, EnhancerConfig


def generate_benchmark_frame(width: int, height: int, frame_idx: int) -> np.ndarray:
    """Generates a synthetic night CCTV frame with a moving license plate and glare."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (20, 24, 28)  # Night asphalt

    # Road lanes
    cv2.line(frame, (width // 2, 0), (width // 2, height), (100, 100, 100), 3)

    # Simulated vehicle moving horizontally
    offset = int((frame_idx * 12) % (width - 400))
    vx = 200 + offset
    vy = height // 2

    # Vehicle body
    cv2.rectangle(frame, (vx, vy), (vx + 260, vy + 140), (45, 50, 60), -1)

    # Headlight Glare (Bloomed circles with core saturation)
    for hx in (vx + 30, vx + 230):
        # Soft bloom halo
        cv2.circle(frame, (hx, vy + 40), 45, (160, 210, 255), -1)
        # Saturated core
        cv2.circle(frame, (hx, vy + 40), 16, (255, 255, 255), -1)

    # License plate with motion blur and text
    px, py = vx + 80, vy + 80
    pw, ph = 100, 40
    cv2.rectangle(frame, (px, py), (px + pw, py + ph), (230, 230, 230), -1)
    cv2.putText(frame, "GJ01AB1234", (px + 6, py + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (10, 10, 10), 1)

    # Add Gaussian sensor noise
    noise = np.random.normal(0, 15, frame.shape).astype(np.int16)
    noisy_frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    return noisy_frame


def run_benchmark(
    resolution: tuple = (1280, 720),
    mode: str = "live",
    num_frames: int = 30,
    target_fps: float = 30.0,
) -> Dict[str, float]:
    """Runs the CCTV enhancer over multiple frames and aggregates per-stage metrics."""
    w, h = resolution
    config = EnhancerConfig(
        mode=mode,
        buffer_size=10,
        target_fps=target_fps,
        stack_count=7 if mode == "review" else 5,
        use_fast_nl_means=(mode == "review"),
    )
    enhancer = CCTVEnhancer(config)

    stage_records: Dict[str, List[float]] = {
        "1_ingestion": [],
        "2_glare_suppression": [],
        "3_temporal_denoise": [],
        "4_motion_deblur": [],
        "5_alignment_stacking": [],
        "6_compositing_audit": [],
        "total": [],
    }

    # Warm-up 5 frames to fill ring buffer
    for i in range(5):
        frame = generate_benchmark_frame(w, h, i)
        enhancer.process_frame(frame)

    # Timed run
    for i in range(num_frames):
        frame = generate_benchmark_frame(w, h, i + 5)
        # Target ROI is around the moving vehicle plate
        offset = int(((i + 5) * 12) % (w - 400))
        roi = (200 + offset + 80, h // 2 + 80, 100, 40)

        _, _, meta = enhancer.process_frame(frame, roi=roi)
        for stage, lat in meta.stage_latencies_ms.items():
            if stage in stage_records:
                stage_records[stage].append(lat)

    # Aggregate results
    avg_results = {}
    for stage, times in stage_records.items():
        avg_results[stage] = float(np.mean(times)) if times else 0.0

    avg_results["effective_fps"] = 1000.0 / max(avg_results["total"], 1e-3)
    avg_results["real_time_viable"] = avg_results["effective_fps"] >= target_fps
    return avg_results


def print_benchmark_table(results_list: List[dict]):
    """Formats and prints an ASCII table of benchmark runs."""
    header = (
        f"{'Resolution':<12} | {'Mode':<8} | {'Ingest':<8} | {'Glare':<8} | "
        f"{'Denoise':<8} | {'Deblur':<8} | {'Stacking':<8} | {'Audit':<8} | "
        f"{'Total(ms)':<10} | {'FPS':<8} | {'Real-Time?':<10}"
    )
    sep = "-" * len(header)
    print("\n" + sep)
    print("NIRIKSHAN REAL-TIME CCTV ENHANCER BENCHMARK SUMMARY")
    print(sep)
    print(header)
    print(sep)

    for res in results_list:
        res_str = f"{res['width']}x{res['height']}"
        viable_str = "YES [OK]" if res["real_time_viable"] else "NO (LAG)"
        row = (
            f"{res_str:<12} | {res['mode']:<8} | "
            f"{res['1_ingestion']:<8.2f} | {res['2_glare_suppression']:<8.2f} | "
            f"{res['3_temporal_denoise']:<8.2f} | {res['4_motion_deblur']:<8.2f} | "
            f"{res['5_alignment_stacking']:<8.2f} | {res['6_compositing_audit']:<8.2f} | "
            f"{res['total']:<10.2f} | {res['effective_fps']:<8.1f} | {viable_str:<10}"
        )
        print(row)
    print(sep + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Benchmark CCTVEnhancer Pipeline")
    parser.add_argument("--frames", type=int, default=20, help="Number of benchmark frames per run")
    parser.add_argument("--fps", type=float, default=30.0, help="Target camera FPS (e.g. 25.0 or 30.0)")
    args = parser.parse_args()

    configurations = [
        {"res": (1280, 720), "mode": "live"},
        {"res": (1280, 720), "mode": "review"},
        {"res": (1920, 1080), "mode": "live"},
        {"res": (1920, 1080), "mode": "review"},
    ]

    all_results = []
    print("Running CCTV Enhancer benchmarks across resolutions and pipeline modes...")
    for cfg in configurations:
        w, h = cfg["res"]
        mode = cfg["mode"]
        print(f"--> Benchmarking {w}x{h} in [{mode.upper()}] mode ({args.frames} frames)...")
        metrics = run_benchmark(
            resolution=(w, h),
            mode=mode,
            num_frames=args.frames,
            target_fps=args.fps,
        )
        metrics["width"] = w
        metrics["height"] = h
        metrics["mode"] = mode
        all_results.append(metrics)

    print_benchmark_table(all_results)
