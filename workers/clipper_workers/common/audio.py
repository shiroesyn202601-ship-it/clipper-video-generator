"""Chunked audio processing so multi-hour podcasts never have to fit in memory.

Overlap-discard: each chunk is processed together with `context_sec` of audio on both sides,
then only the chunk's own frames are kept. Models see real context at the edges, so there are
no seams, and the output has exactly the same length as the input.
"""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

# (frames, channels) float32 audio
AudioBlock = np.ndarray
ProcessFn = Callable[[AudioBlock, int], Mapping[str, AudioBlock]]
ProgressFn = Callable[[float], None]


@dataclass(frozen=True)
class OutputSpec:
    path: Path
    channels: int


def iter_chunks(total_frames: int, chunk_frames: int, context_frames: int):
    """Yields (start, end, context_start, context_end) frame indices covering the whole file."""
    if chunk_frames <= 0:
        raise ValueError("chunk_frames must be positive")
    for start in range(0, total_frames, chunk_frames):
        end = min(start + chunk_frames, total_frames)
        yield start, end, max(0, start - context_frames), min(total_frames, end + context_frames)


def process_in_chunks(
    input_path: Path,
    outputs: Mapping[str, OutputSpec],
    process: ProcessFn,
    *,
    chunk_sec: float,
    context_sec: float,
    on_progress: ProgressFn | None = None,
) -> int:
    """Streams `input_path` through `process` and writes every named output as 16-bit WAV.

    `process` receives (frames, channels) float32 audio plus the sample rate and must return a
    mapping name -> (same frames, spec.channels) array. Outputs are written to temporary files
    and renamed at the end, so a crash never leaves a file that looks complete.
    Returns the sample rate.
    """
    info = sf.info(str(input_path))
    sample_rate = int(info.samplerate)
    total = int(info.frames)
    chunk_frames = max(1, int(chunk_sec * sample_rate))
    context_frames = int(context_sec * sample_rate)

    temp_paths = {name: spec.path.with_suffix(".partial.wav") for name, spec in outputs.items()}
    writers = {
        name: sf.SoundFile(
            str(temp_paths[name]),
            mode="w",
            samplerate=sample_rate,
            channels=spec.channels,
            subtype="PCM_16",
        )
        for name, spec in outputs.items()
    }
    try:
        for start, end, context_start, context_end in iter_chunks(
            total, chunk_frames, context_frames
        ):
            block, _ = sf.read(
                str(input_path),
                start=context_start,
                stop=context_end,
                dtype="float32",
                always_2d=True,
            )
            results = process(block, sample_rate)
            keep_from = start - context_start
            keep_to = keep_from + (end - start)
            for name, writer in writers.items():
                result = np.asarray(results[name], dtype=np.float32)
                if result.shape[0] != block.shape[0]:
                    raise ValueError(
                        f"process returned {result.shape[0]} frames for '{name}', "
                        f"expected {block.shape[0]}"
                    )
                writer.write(np.clip(result[keep_from:keep_to], -1.0, 1.0))
            if on_progress is not None and total > 0:
                on_progress(end / total)
    except BaseException:
        for writer in writers.values():
            writer.close()
        for temp in temp_paths.values():
            temp.unlink(missing_ok=True)
        raise
    for writer in writers.values():
        writer.close()
    for name, spec in outputs.items():
        os.replace(temp_paths[name], spec.path)
    return sample_rate


def to_mono(block: AudioBlock) -> AudioBlock:
    """(frames, channels) -> (frames, 1)"""
    return block.mean(axis=1, keepdims=True)


def fit_length(audio: np.ndarray, frames: int) -> np.ndarray:
    """Pads with zeros or trims along axis 0 so resampling round-trips keep the exact length."""
    if audio.shape[0] == frames:
        return audio
    if audio.shape[0] > frames:
        return audio[:frames]
    pad = np.zeros((frames - audio.shape[0], *audio.shape[1:]), dtype=audio.dtype)
    return np.concatenate([audio, pad], axis=0)
