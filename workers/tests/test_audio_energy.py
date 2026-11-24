import numpy as np

from clipper_workers.audio_energy import SILENCE_DB, rms_db


def test_full_scale_sine_is_about_minus_3_db() -> None:
    t = np.arange(16000) / 16000
    assert abs(rms_db(np.sin(2 * np.pi * 440 * t)) - (-3.01)) < 0.05


def test_silence_is_floored() -> None:
    assert rms_db(np.zeros(100)) == SILENCE_DB
    assert rms_db(np.array([])) == SILENCE_DB
