"""JSON Lines protocol between workers and the Node server.

stdout carries only protocol messages, one JSON object per line:
  {"type": "progress", "percent": 42.5, "message": "..."}
  {"type": "result", "outputs": {...}}
  {"type": "error", "code": "...", "message": "..."}
Everything else (human logs, library noise) must go to stderr.
"""

from __future__ import annotations

import json
import logging
import sys
import traceback
from collections.abc import Callable
from pathlib import Path
from typing import Any, TextIO

_protocol_out: TextIO = sys.stdout


class WorkerError(Exception):
    """Expected failure with a stable code the server can map to a user message."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _write(payload: dict[str, Any]) -> None:
    _protocol_out.write(json.dumps(payload, ensure_ascii=False) + "\n")
    _protocol_out.flush()


def emit_progress(percent: float, message: str = "") -> None:
    clamped = max(0.0, min(100.0, percent))
    _write({"type": "progress", "percent": round(clamped, 2), "message": message})


def emit_result(outputs: dict[str, Any]) -> None:
    _write({"type": "result", "outputs": _jsonable(outputs)})


def emit_error(code: str, message: str) -> None:
    _write({"type": "error", "code": code, "message": message})


def _jsonable(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(item) for item in value]
    return value


def run_worker(main: Callable[[], dict[str, Any]]) -> None:
    """Runs a worker's main function with the standard protocol and exit codes.

    Library output that writes to stdout (e.g. demucs, tqdm) is redirected to stderr so the
    protocol stream stays clean.
    """
    global _protocol_out
    logging.basicConfig(
        stream=sys.stderr, level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )
    _protocol_out = sys.stdout
    sys.stdout = sys.stderr
    try:
        outputs = main()
        emit_result(outputs)
    except WorkerError as error:
        emit_error(error.code, str(error))
        sys.exit(1)
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit_error("WORKER_CRASHED", f"{type(error).__name__}: {error}")
        sys.exit(1)
    finally:
        sys.stdout = _protocol_out
