"""Shared argument helpers so every worker has the same CLI contract."""

from __future__ import annotations

import argparse
from pathlib import Path

from .io import WorkerError


def base_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--input", required=True, type=Path, help="Input file")
    parser.add_argument("--output", required=True, type=Path, help="Output directory")
    return parser


def existing_file(path: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_file():
        raise WorkerError("INPUT_NOT_FOUND", f"Input file not found: {resolved}")
    return resolved


def output_dir(path: Path) -> Path:
    resolved = path.resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved
