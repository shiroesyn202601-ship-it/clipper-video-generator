from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from clipper_workers.common.audio import OutputSpec, fit_length, iter_chunks, process_in_chunks

SAMPLE_RATE = 8000


def write_tone(path: Path, seconds: float, channels: int = 2) -> np.ndarray:
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    mono = 0.5 * np.sin(2 * np.pi * 220 * t)
    audio = np.stack([mono] * channels, axis=1).astype(np.float32)
    sf.write(str(path), audio, SAMPLE_RATE, subtype="PCM_16")
    return audio


def test_iter_chunks_covers_every_frame_once() -> None:
    chunks = list(iter_chunks(total_frames=25, chunk_frames=10, context_frames=3))
    assert [(start, end) for start, end, _, _ in chunks] == [(0, 10), (10, 20), (20, 25)]
    assert chunks[1][2:] == (7, 23)
    assert chunks[0][2] == 0 and chunks[-1][3] == 25


def test_identity_process_round_trips_exactly(tmp_path: Path) -> None:
    source = tmp_path / "in.wav"
    write_tone(source, seconds=3.3)
    expected, _ = sf.read(str(source), dtype="float32", always_2d=True)
    progress: list[float] = []

    process_in_chunks(
        source,
        {"copy": OutputSpec(tmp_path / "out.wav", 2)},
        lambda block, _sr: {"copy": block},
        chunk_sec=1.0,
        context_sec=0.25,
        on_progress=progress.append,
    )

    result, rate = sf.read(str(tmp_path / "out.wav"), dtype="float32", always_2d=True)
    assert rate == SAMPLE_RATE
    np.testing.assert_allclose(result, expected, atol=1e-4)
    assert progress == sorted(progress) and progress[-1] == 1.0
    assert not (tmp_path / "out.partial.wav").exists()


def test_multiple_outputs_and_channel_change(tmp_path: Path) -> None:
    source = tmp_path / "in.wav"
    write_tone(source, seconds=1.5)
    process_in_chunks(
        source,
        {
            "mono": OutputSpec(tmp_path / "mono.wav", 1),
            "silent": OutputSpec(tmp_path / "silent.wav", 2),
        },
        lambda block, _sr: {"mono": block.mean(axis=1, keepdims=True), "silent": block * 0},
        chunk_sec=0.4,
        context_sec=0.1,
    )
    assert sf.info(str(tmp_path / "mono.wav")).channels == 1
    assert sf.info(str(tmp_path / "mono.wav")).frames == int(1.5 * SAMPLE_RATE)
    silent, _ = sf.read(str(tmp_path / "silent.wav"))
    assert np.abs(silent).max() == 0


def test_failure_leaves_no_partial_files(tmp_path: Path) -> None:
    source = tmp_path / "in.wav"
    write_tone(source, seconds=1.0)

    def broken(_block: np.ndarray, _sr: int) -> dict[str, np.ndarray]:
        raise RuntimeError("model crashed")

    with pytest.raises(RuntimeError):
        process_in_chunks(
            source,
            {"out": OutputSpec(tmp_path / "out.wav", 2)},
            broken,
            chunk_sec=0.5,
            context_sec=0.1,
        )
    assert list(tmp_path.iterdir()) == [source]


def test_fit_length_pads_and_trims() -> None:
    audio = np.ones((5, 1), dtype=np.float32)
    assert fit_length(audio, 3).shape == (3, 1)
    padded = fit_length(audio, 7)
    assert padded.shape == (7, 1) and padded[-1, 0] == 0
