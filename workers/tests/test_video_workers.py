"""End-to-end tests for track_faces + reframe on a synthetic video (no faces).

Skipped when ffmpeg or the YuNet model is not available. Set FFMPEG_BIN to point at ffmpeg
when it is not on PATH.
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from clipper_workers.common.video import probe_video

WORKERS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = WORKERS_DIR.parent
FFMPEG = os.environ.get("FFMPEG_BIN") or shutil.which("ffmpeg")
FACE_MODEL = REPO_ROOT / "tools" / "models" / "face_detection_yunet_2023mar.onnx"

pytestmark = pytest.mark.skipif(
    FFMPEG is None or not FACE_MODEL.exists(), reason="ffmpeg or YuNet model not available"
)


def run_worker(module: str, *args: str) -> dict[str, object]:
    result = subprocess.run(
        [sys.executable, "-m", f"clipper_workers.{module}", *args],
        cwd=WORKERS_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.startswith("{")]
    assert result.returncode == 0, result.stderr[-2000:]
    assert lines[-1]["type"] == "result"
    return lines[-1]


@pytest.fixture(scope="module")
def source(tmp_path_factory: pytest.TempPathFactory) -> Path:
    path = tmp_path_factory.mktemp("src") / "source.mp4"
    subprocess.run(
        [
            str(FFMPEG),
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=1280x720:rate=25:duration=4",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )
    return path


def test_track_faces_without_faces_centers_the_crop(source: Path, tmp_path: Path) -> None:
    run_worker(
        "track_faces",
        "--input", str(source),
        "--start", "1", "--end", "3",
        "--model", str(FACE_MODEL),
        "--ffmpeg", str(FFMPEG),
        "--output", str(tmp_path),
    )  # fmt: skip
    faces = json.loads((tmp_path / "faces.json").read_text(encoding="utf-8"))
    assert faces["hasFaces"] is False
    assert faces["crop"] == {"width": 404, "height": 720}
    assert {key["centerX"] for key in faces["keyframes"]} == {640.0}


def test_reframe_writes_exact_vertical_video(source: Path, tmp_path: Path) -> None:
    (tmp_path / "faces.json").write_text(
        json.dumps(
            {
                "fps": 25,
                "sourceWidth": 1280,
                "sourceHeight": 720,
                "crop": {"width": 404, "height": 720},
                "keyframes": [{"timeSec": 0, "centerX": 300}, {"timeSec": 2, "centerX": 900}],
                "hasFaces": True,
            }
        ),
        encoding="utf-8",
    )
    run_worker(
        "reframe",
        "--input", str(source),
        "--faces", str(tmp_path / "faces.json"),
        "--start", "1", "--end", "3",
        "--ffmpeg", str(FFMPEG),
        "--width", "540", "--height", "960",
        "--output", str(tmp_path),
    )  # fmt: skip
    info = probe_video(tmp_path / "reframed.mp4")
    assert (info.width, info.height) == (540, 960)
    assert not (tmp_path / "reframed.partial.mp4").exists()
