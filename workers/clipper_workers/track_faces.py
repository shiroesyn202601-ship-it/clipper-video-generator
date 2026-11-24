"""Finds and follows the active speaker's face for one clip.

python -m clipper_workers.track_faces --input source.mp4 --start 12.3 --end 47.9 \
    --model face_detection_yunet_2023mar.onnx --ffmpeg ffmpeg --output clips/<id>/

Writes faces.json: crop size and the crop-center path (clip-relative time).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np

from .common.cli import base_parser, existing_file, output_dir
from .common.io import WorkerError, emit_progress, run_worker
from .common.video import probe_video, read_frames
from .framing import FaceObservation, FrameObservation, choose_subjects, smooth_path

# Faces are detected on a downscaled stream at this rate (frames per second).
DETECT_FPS = 5.0
# Width of the detection stream (pixels). Faces stay large enough in podcast framing.
DETECT_WIDTH = 640
# YuNet confidence threshold and non-maximum suppression.
SCORE_THRESHOLD = 0.6
NMS_THRESHOLD = 0.3
TOP_K = 20
# Norfair: max centroid jump between detections, as a share of the detection width.
TRACK_DISTANCE_RATIO = 0.08
# Frames a track survives without detections (at DETECT_FPS), ~2 s.
TRACK_HIT_COUNTER_MAX = 10
# Mouth region is resized to this size before frame differencing (pixels).
MOUTH_ROI_SIZE = (32, 16)
# Smoothing factor for mouth activity (higher = reacts faster).
ACTIVITY_EMA = 0.4


def even(value: float) -> int:
    return max(2, int(round(value / 2)) * 2)


def crop_size(width: int, height: int) -> tuple[int, int]:
    """Largest 9:16 crop that fits the source."""
    crop_w = min(width, even(height * 9 / 16))
    crop_h = min(height, even(crop_w * 16 / 9))
    return crop_w, crop_h


def mouth_roi(gray: np.ndarray, face: np.ndarray) -> np.ndarray | None:
    """Grayscale patch around the mouth corners (YuNet landmarks 4 and 5)."""
    x, y, w, h = face[0:4]
    right_corner = face[10:12]
    left_corner = face[12:14]
    x0 = int(min(right_corner[0], left_corner[0]) - 0.15 * w)
    x1 = int(max(right_corner[0], left_corner[0]) + 0.15 * w)
    y0 = int(min(right_corner[1], left_corner[1]) - 0.1 * h)
    y1 = int(min(right_corner[1], left_corner[1]) + 0.25 * h)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(gray.shape[1], x1), min(gray.shape[0], y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return None
    return cv2.resize(gray[y0:y1, x0:x1], MOUTH_ROI_SIZE).astype(np.float32)


def main() -> dict[str, object]:
    parser = base_parser("Track the active speaker's face")
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    source = existing_file(args.input)
    model = existing_file(args.model)
    out_dir = output_dir(args.output)
    duration = args.end - args.start
    if duration <= 0:
        raise WorkerError("INVALID_RANGE", f"end ({args.end}) must be after start ({args.start})")

    from norfair import Detection, Tracker

    info = probe_video(source)
    detect_height = even(info.height * DETECT_WIDTH / info.width)
    scale = info.width / DETECT_WIDTH
    detector = cv2.FaceDetectorYN.create(
        str(model), "", (DETECT_WIDTH, detect_height), SCORE_THRESHOLD, NMS_THRESHOLD, TOP_K
    )
    tracker = Tracker(
        distance_function="euclidean",
        distance_threshold=TRACK_DISTANCE_RATIO * DETECT_WIDTH,
        hit_counter_max=TRACK_HIT_COUNTER_MAX,
        initialization_delay=1,
    )

    observations: list[FrameObservation] = []
    previous_roi: dict[int, np.ndarray] = {}
    activity: dict[int, float] = {}
    expected_frames = max(1, int(duration * DETECT_FPS))
    frames = read_frames(
        args.ffmpeg,
        source,
        args.start,
        duration,
        DETECT_WIDTH,
        detect_height,
        video_filter=f"fps={DETECT_FPS},scale={DETECT_WIDTH}:{detect_height}",
    )
    for index, frame in enumerate(frames):
        _, faces = detector.detect(frame)
        detections = [
            Detection(points=np.array([[f[0] + f[2] / 2, f[1] + f[3] / 2]]), data=f)
            for f in (faces if faces is not None else [])
        ]
        tracked = tracker.update(detections=detections)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces_now: list[FaceObservation] = []
        for obj in tracked:
            detection = obj.last_detection
            if detection is None or not any(detection is d for d in detections):
                continue  # not seen in this frame
            face = detection.data
            roi = mouth_roi(gray, face)
            motion = 0.0
            if roi is not None and obj.id in previous_roi:
                motion = float(np.mean(np.abs(roi - previous_roi[obj.id]))) / 255.0
            if roi is not None:
                previous_roi[obj.id] = roi
            activity[obj.id] = (1 - ACTIVITY_EMA) * activity.get(obj.id, motion) + (
                ACTIVITY_EMA * motion
            )
            faces_now.append(
                FaceObservation(
                    track_id=int(obj.id),
                    center_x=float(face[0] + face[2] / 2) * scale,
                    width=float(face[2]) * scale,
                    activity=activity[obj.id],
                )
            )
        observations.append(FrameObservation(index / DETECT_FPS, tuple(faces_now)))
        if index % 10 == 0:
            emit_progress(min(99.0, 100 * index / expected_frames), "Mendeteksi wajah")

    crop_w, crop_h = crop_size(info.width, info.height)
    subjects = choose_subjects(observations)
    targets: list[float | None] = []
    for frame_obs, subject in zip(observations, subjects, strict=True):
        match = next((face for face in frame_obs.faces if face.track_id == subject), None)
        targets.append(match.center_x if match else None)
    keyframes = smooth_path(
        [frame_obs.time_sec for frame_obs in observations], targets, subjects, info.width, crop_w
    )

    result = {
        "fps": info.fps,
        "sourceWidth": info.width,
        "sourceHeight": info.height,
        "crop": {"width": crop_w, "height": crop_h},
        "keyframes": [
            {"timeSec": round(key.time_sec, 3), "centerX": round(key.center_x, 1)}
            for key in keyframes
        ],
        "hasFaces": any(frame_obs.faces for frame_obs in observations),
    }
    output_path = out_dir / "faces.json"
    temp_path = output_path.with_suffix(".partial.json")
    temp_path.write_text(json.dumps(result), encoding="utf-8")
    os.replace(temp_path, output_path)
    return {"faces": output_path}


if __name__ == "__main__":
    run_worker(main)
