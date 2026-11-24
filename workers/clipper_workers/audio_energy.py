"""Measures loudness over time, used to score moments.

python -m clipper_workers.audio_energy --input audio16k.wav --output audio/ [--step 0.5]

Writes energy.json: {"stepSec": 0.5, "rmsDb": [...]} with RMS in dBFS per step.
"""

from __future__ import annotations

import json
import math
import os

import numpy as np
import soundfile as sf

from .common.cli import base_parser, existing_file, output_dir
from .common.io import emit_progress, run_worker

# Floor for silence so log10 never sees zero (dBFS).
SILENCE_DB = -90.0
DEFAULT_STEP_SEC = 0.5


def rms_db(block: np.ndarray) -> float:
    if block.size == 0:
        return SILENCE_DB
    rms = float(np.sqrt(np.mean(np.square(block, dtype=np.float64))))
    return SILENCE_DB if rms <= 0 else max(SILENCE_DB, 20 * math.log10(rms))


def main() -> dict[str, object]:
    parser = base_parser("Measure audio energy per step")
    parser.add_argument("--step", type=float, default=DEFAULT_STEP_SEC)
    args = parser.parse_args()
    input_path = existing_file(args.input)
    out_dir = output_dir(args.output)

    info = sf.info(str(input_path))
    step_frames = max(1, int(args.step * info.samplerate))
    total_steps = max(1, math.ceil(info.frames / step_frames))
    values: list[float] = []
    for index, block in enumerate(
        sf.blocks(str(input_path), blocksize=step_frames, dtype="float32", always_2d=True)
    ):
        values.append(round(rms_db(block.mean(axis=1)), 2))
        if index % 500 == 0:
            emit_progress(100 * index / total_steps, "Mengukur energi suara")

    output_path = out_dir / "energy.json"
    temp_path = output_path.with_suffix(".partial.json")
    temp_path.write_text(json.dumps({"stepSec": args.step, "rmsDb": values}), encoding="utf-8")
    os.replace(temp_path, output_path)
    return {"energy": output_path}


if __name__ == "__main__":
    run_worker(main)
