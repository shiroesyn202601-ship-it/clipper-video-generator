from clipper_workers.tts import ticks_to_words


def test_ticks_to_words_converts_to_seconds_and_skips_empty():
    words = ticks_to_words(
        [
            {"offset": 1_000_000, "duration": 4_000_000, "text": "Halo"},
            {"offset": 6_000_000, "duration": 2_500_000, "text": " "},
            {"offset": 9_000_000, "duration": 3_000_000, "text": "semua"},
        ]
    )
    assert words == [
        {"text": "Halo", "startSec": 0.1, "endSec": 0.5},
        {"text": "semua", "startSec": 0.9, "endSec": 1.2},
    ]
