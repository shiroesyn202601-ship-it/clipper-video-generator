"""Separates vocals from music/background with Demucs.

python -m clipper_workers.separate_vocals --input audio_full.wav --output audio/ \
    [--model htdemucs] [--device cpu]

Writes vocals.wav and no_vocals.wav (same sample rate and length as the input).
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import soundfile as sf

from .common.audio import OutputSpec, process_in_chunks
from .common.cli import base_parser, existing_file, output_dir
from .common.io import WorkerError, emit_progress, run_worker

# Audio handed to Demucs per step (seconds). Bounds memory for multi-hour files.
CHUNK_SEC = 120.0
# Extra audio on both sides so chunk edges have real context (seconds).
CONTEXT_SEC = 3.0
# Overlap between Demucs' internal segments (fraction), the library default.
SEGMENT_OVERLAP = 0.25
# Share of the progress bar used by the normalization pass.
STATS_PROGRESS_SHARE = 5.0

log = logging.getLogger("separate_vocals")


def global_stats(input_path: Path, block_frames: int = 1_000_000) -> tuple[float, float]:
    """Mean and std of the mono mix over the whole file, as demucs.separate computes them.

    Using whole-file statistics keeps loudness consistent across chunks.
    """
    count = 0
    total = 0.0
    total_sq = 0.0
    for block in sf.blocks(
        str(input_path), blocksize=block_frames, dtype="float32", always_2d=True
    ):
        mono = block.mean(axis=1).astype(np.float64)
        count += mono.size
        total += float(mono.sum())
        total_sq += float(np.square(mono).sum())
    if count == 0:
        raise WorkerError("EMPTY_AUDIO", "Input audio is empty")
    mean = total / count
    std = max((total_sq / count - mean * mean) ** 0.5, 1e-8)
    return mean, std


def main() -> dict[str, object]:
    parser = base_parser("Separate vocals with Demucs")
    parser.add_argument("--model", default="htdemucs")
    parser.add_argument("--device", default="cpu", choices=["cpu", "cuda"])
    args = parser.parse_args()

    input_path = existing_file(args.input)
    out_dir = output_dir(args.output)

    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    if args.device == "cuda" and not torch.cuda.is_available():
        raise WorkerError("CUDA_UNAVAILABLE", "DEMUCS_DEVICE=cuda but CUDA is not available")

    emit_progress(0, "Memuat model Demucs")
    model = get_model(args.model)
    model.eval()
    if "vocals" not in model.sources:
        raise WorkerError("MODEL_WITHOUT_VOCALS", f"Model {args.model} has no vocals source")
    vocals_index = model.sources.index("vocals")

    info = sf.info(str(input_path))
    if int(info.samplerate) != model.samplerate or info.channels != model.audio_channels:
        raise WorkerError(
            "UNEXPECTED_AUDIO_FORMAT",
            f"Expected {model.samplerate} Hz / {model.audio_channels} ch, "
            f"got {info.samplerate} Hz / {info.channels} ch",
        )

    mean, std = global_stats(input_path)
    emit_progress(STATS_PROGRESS_SHARE, "Memisahkan suara")

    def process(block: np.ndarray, _sample_rate: int) -> dict[str, np.ndarray]:
        wav = torch.from_numpy(block.T.copy())  # (channels, frames)
        wav = (wav - mean) / std
        with torch.no_grad():
            sources = apply_model(
                model,
                wav[None],
                device=args.device,
                split=True,
                overlap=SEGMENT_OVERLAP,
                progress=False,
            )[0]
        sources = sources * std + mean
        vocals = sources[vocals_index]
        rest = sources.sum(dim=0) - vocals
        return {"vocals": vocals.T.cpu().numpy(), "no_vocals": rest.T.cpu().numpy()}

    vocals_path = out_dir / "vocals.wav"
    rest_path = out_dir / "no_vocals.wav"
    process_in_chunks(
        input_path,
        {
            "vocals": OutputSpec(vocals_path, model.audio_channels),
            "no_vocals": OutputSpec(rest_path, model.audio_channels),
        },
        process,
        chunk_sec=CHUNK_SEC,
        context_sec=CONTEXT_SEC,
        on_progress=lambda fraction: emit_progress(
            STATS_PROGRESS_SHARE + fraction * (100 - STATS_PROGRESS_SHARE), "Memisahkan suara"
        ),
    )
    return {"vocals": vocals_path, "noVocals": rest_path}


if __name__ == "__main__":
    run_worker(main)
