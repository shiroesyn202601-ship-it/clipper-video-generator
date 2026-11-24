"""Reads commentary text aloud with Edge-TTS (Microsoft, free, online).

python -m clipper_workers.tts --input intro.txt --output clips/<id>/commentary \
    --voice id-ID-ArdiNeural --name intro

Writes <name>.mp3 and returns its word timings, used for the commentary captions.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from .common.cli import base_parser, existing_file, output_dir
from .common.io import WorkerError, emit_progress, run_worker

# Edge-TTS reports offsets and durations in 100-nanosecond ticks.
TICKS_PER_SECOND = 10_000_000

log = logging.getLogger("tts")


def ticks_to_words(boundaries: list[dict[str, object]]) -> list[dict[str, object]]:
    """WordBoundary events → [{"text", "startSec", "endSec"}] in seconds."""
    words = []
    for item in boundaries:
        offset = int(item.get("offset", 0))  # type: ignore[arg-type]
        duration = int(item.get("duration", 0))  # type: ignore[arg-type]
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = offset / TICKS_PER_SECOND
        words.append(
            {
                "text": text,
                "startSec": round(start, 3),
                "endSec": round(start + duration / TICKS_PER_SECOND, 3),
            }
        )
    return words


async def synthesize(text: str, voice: str, audio_path: Path) -> list[dict[str, object]]:
    import edge_tts

    try:
        communicate = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    except TypeError:  # edge-tts < 7 always sends word boundaries
        communicate = edge_tts.Communicate(text, voice)
    boundaries: list[dict[str, object]] = []
    with audio_path.open("wb") as audio:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                boundaries.append(chunk)
    return boundaries


def main() -> dict[str, object]:
    parser = base_parser("Text to speech with Edge-TTS")
    parser.add_argument("--voice", required=True, help="Edge-TTS voice, e.g. id-ID-ArdiNeural")
    parser.add_argument("--name", required=True, help="Output base name (intro / outro)")
    args = parser.parse_args()
    text = existing_file(args.input).read_text(encoding="utf-8").strip()
    if not text:
        raise WorkerError("EMPTY_TEXT", "Commentary text is empty")
    if not args.name.isalnum():
        raise WorkerError("BAD_NAME", f"Invalid output name: {args.name}")
    out_dir = output_dir(args.output)
    audio_path = out_dir / f"{args.name}.mp3"

    emit_progress(0, "Membuat suara komentar")
    try:
        boundaries = asyncio.run(synthesize(text, args.voice, audio_path))
    except ImportError as error:
        raise WorkerError("EDGE_TTS_MISSING", "Python package edge-tts is not installed") from error
    except Exception as error:
        log.exception("edge-tts failed")
        raise WorkerError("TTS_FAILED", f"{type(error).__name__}: {error}") from error
    if not audio_path.is_file() or audio_path.stat().st_size == 0:
        raise WorkerError("TTS_FAILED", "Edge-TTS returned no audio")
    emit_progress(100, "Suara komentar selesai")
    return {"audio": audio_path, "words": ticks_to_words(boundaries)}


if __name__ == "__main__":
    run_worker(main)
