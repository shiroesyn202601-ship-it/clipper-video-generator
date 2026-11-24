"""Frame I/O through ffmpeg pipes.

Decoding with `ffmpeg -ss <start> -i <src>` is frame-accurate, so video frames stay in sync with
audio cut by ffmpeg at the same timestamps (OpenCV seeking can land on the nearest keyframe).
"""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .io import WorkerError


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float


def probe_video(path: Path) -> VideoInfo:
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise WorkerError("VIDEO_UNREADABLE", f"Cannot open video: {path}")
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = float(capture.get(cv2.CAP_PROP_FPS)) or 30.0
    finally:
        capture.release()
    if width <= 0 or height <= 0:
        raise WorkerError("VIDEO_UNREADABLE", f"Video has no frames: {path}")
    return VideoInfo(width=width, height=height, fps=fps)


def read_frames(
    ffmpeg: str,
    source: Path,
    start_sec: float,
    duration_sec: float,
    width: int,
    height: int,
    video_filter: str | None = None,
) -> Iterator[np.ndarray]:
    """Yields BGR frames of size (height, width, 3) for [start, start + duration)."""
    args = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source),
        "-t",
        f"{duration_sec:.3f}",
        "-an",
    ]
    if video_filter:
        args += ["-vf", video_filter]
    args += ["-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    frame_bytes = width * height * 3
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert process.stdout is not None
    try:
        while True:
            buffer = process.stdout.read(frame_bytes)
            if len(buffer) < frame_bytes:
                break
            yield np.frombuffer(buffer, dtype=np.uint8).reshape((height, width, 3))
    finally:
        process.stdout.close()
        stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
        code = process.wait()
        if code not in (0, None) and code != -15:
            raise WorkerError("FFMPEG_DECODE_FAILED", stderr.strip()[-500:] or f"exit {code}")


class FrameWriter:
    """Encodes BGR frames to H.264 MP4 through ffmpeg stdin (much better than cv2.VideoWriter)."""

    def __init__(self, ffmpeg: str, output: Path, width: int, height: int, fps: float) -> None:
        self._output = output
        self._process = subprocess.Popen(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "bgr24",
                "-s",
                f"{width}x{height}",
                "-r",
                f"{fps:.6f}",
                "-i",
                "-",
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(output),
            ],
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def write(self, frame: np.ndarray) -> None:
        assert self._process.stdin is not None
        self._process.stdin.write(np.ascontiguousarray(frame).tobytes())

    def close(self) -> None:
        assert self._process.stdin is not None
        self._process.stdin.close()
        stderr = (
            self._process.stderr.read().decode("utf-8", "replace") if self._process.stderr else ""
        )
        if self._process.wait() != 0:
            raise WorkerError("FFMPEG_ENCODE_FAILED", stderr.strip()[-500:])

    def abort(self) -> None:
        self._process.kill()
        self._process.wait()
        self._output.unlink(missing_ok=True)
