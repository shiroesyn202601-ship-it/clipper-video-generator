"""Removes background noise from the vocal track with DeepFilterNet.

python -m clipper_workers.denoise --input vocals.wav --output audio/

Writes vocals_clean.wav: mono, same sample rate and length as the input.
"""

from __future__ import annotations

import logging

import numpy as np

from .common.audio import OutputSpec, fit_length, process_in_chunks, to_mono
from .common.cli import base_parser, existing_file, output_dir
from .common.io import emit_progress, run_worker

# Audio per DeepFilterNet call (seconds).
CHUNK_SEC = 30.0
# Context on both sides of a chunk (seconds); DeepFilterNet's receptive field is short.
CONTEXT_SEC = 1.0

log = logging.getLogger("denoise")


def main() -> dict[str, object]:
    args = base_parser("Denoise speech with DeepFilterNet").parse_args()
    input_path = existing_file(args.input)
    out_dir = output_dir(args.output)

    import torch
    from df.enhance import enhance, init_df
    from df.io import resample

    emit_progress(0, "Memuat model DeepFilterNet")
    # log_file=None: the library otherwise writes enhance.log into the working directory.
    model, df_state, _ = init_df(log_level="WARNING", log_file=None)
    model_rate = int(df_state.sr())

    def process(block: np.ndarray, sample_rate: int) -> dict[str, np.ndarray]:
        frames = block.shape[0]
        mono = torch.from_numpy(to_mono(block).T.copy())  # (1, frames)
        audio = resample(mono, sample_rate, model_rate) if sample_rate != model_rate else mono
        with torch.no_grad():
            enhanced = enhance(model, df_state, audio)
        if sample_rate != model_rate:
            enhanced = resample(enhanced, model_rate, sample_rate)
        return {"clean": fit_length(enhanced.T.cpu().numpy(), frames)}

    clean_path = out_dir / "vocals_clean.wav"
    process_in_chunks(
        input_path,
        {"clean": OutputSpec(clean_path, 1)},
        process,
        chunk_sec=CHUNK_SEC,
        context_sec=CONTEXT_SEC,
        on_progress=lambda fraction: emit_progress(fraction * 100, "Membersihkan noise"),
    )
    return {"vocalsClean": clean_path}


if __name__ == "__main__":
    run_worker(main)
