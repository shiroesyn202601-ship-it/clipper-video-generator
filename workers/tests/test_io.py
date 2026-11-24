import json
import subprocess
import sys
from pathlib import Path

WORKERS_DIR = Path(__file__).resolve().parents[1]

SCRIPT = """
import sys
from clipper_workers.common.io import WorkerError, emit_progress, run_worker

def main():
    print("library noise")
    emit_progress(150, "clamped")
    if sys.argv[1] == "fail":
        raise WorkerError("BAD_INPUT", "nope")
    return {"path": __import__("pathlib").Path("a/b.wav")}

run_worker(main)
"""


def run(mode: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-c", SCRIPT, mode],
        cwd=WORKERS_DIR,
        capture_output=True,
        text=True,
        check=False,
    )


def parse_lines(stdout: str) -> list[dict[str, object]]:
    return [json.loads(line) for line in stdout.splitlines() if line.strip()]


def test_stdout_contains_only_protocol_messages() -> None:
    result = run("ok")
    assert result.returncode == 0
    messages = parse_lines(result.stdout)
    assert [message["type"] for message in messages] == ["progress", "result"]
    assert "library noise" in result.stderr


def test_progress_is_clamped_and_paths_serialized() -> None:
    messages = parse_lines(run("ok").stdout)
    assert messages[0]["percent"] == 100.0
    assert messages[1]["outputs"] == {"path": str(Path("a/b.wav"))}


def test_worker_error_sets_exit_code_and_error_message() -> None:
    result = run("fail")
    assert result.returncode == 1
    last = parse_lines(result.stdout)[-1]
    assert last == {"type": "error", "code": "BAD_INPUT", "message": "nope"}
