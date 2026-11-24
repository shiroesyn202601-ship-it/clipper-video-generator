"""Crops a clip to 9:16 following the camera path in faces.json (video only, no audio).

python -m clipper_workers.reframe --input source.mp4 --faces faces.json --start 12.3 --end 47.9 \
    --ffmpeg ffmpeg --output clips/<id>/ [--width 1080 --height 1920]
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import cv2

from .common.cli import base_parser, existing_file, output_dir
from .common.io import WorkerError, emit_progress, run_worker
from .common.video import FrameWriter, probe_video, read_frames
from .framing import Keyframe, interpolate


def main() -> dict[str, object]:
    parser = base_parser("Reframe a clip to 9:16")
    parser.add_argument("--faces", type=Path, required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--height", type=int, default=1920)
    args = parser.parse_args()
    source = existing_file(args.input)
    faces = json.loads(existing_file(args.faces).read_text(encoding="utf-8"))
    out_dir = output_dir(args.output)
    duration = args.end - args.start
    if duration <= 0:
        raise WorkerError("INVALID_RANGE", f"end ({args.end}) must be after start ({args.start})")

    info = probe_video(source)
    crop_w = int(faces["crop"]["width"])
    crop_h = int(faces["crop"]["height"])
    keyframes = [Keyframe(key["timeSec"], key["centerX"]) for key in faces["keyframes"]]
    y0 = (info.height - crop_h) // 2
    upscaling = args.width > crop_w
    interpolation = cv2.INTER_LANCZOS4 if upscaling else cv2.INTER_AREA

    output_path = out_dir / "reframed.mp4"
    temp_path = out_dir / "reframed.partial.mp4"
    writer = FrameWriter(args.ffmpeg, temp_path, args.width, args.height, info.fps)
    total_frames = max(1, round(duration * info.fps))
    try:
        frames = read_frames(
            args.ffmpeg,
            source,
            args.start,
            duration,
            info.width,
            info.height,
            # Constant frame rate so frame index ↔ time stays exact.
            video_filter=f"fps={info.fps:.6f}",
        )
        for index, frame in enumerate(frames):
            center = interpolate(keyframes, index / info.fps)
            x0 = int(round(center - crop_w / 2))
            x0 = max(0, min(info.width - crop_w, x0))
            crop = frame[y0 : y0 + crop_h, x0 : x0 + crop_w]
            writer.write(cv2.resize(crop, (args.width, args.height), interpolation=interpolation))
            if index % 30 == 0:
                emit_progress(min(99.0, 100 * index / total_frames), "Crop 9:16")
        writer.close()
    except BaseException:
        writer.abort()
        raise
    os.replace(temp_path, output_path)
    return {"video": output_path}


if __name__ == "__main__":
    run_worker(main)
