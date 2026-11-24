import type { TranscriptWord } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { buildCaptions, wordsInRange, wrapCaption } from "./build-captions.ts";

function words(text: string, startSec: number, step = 0.3): TranscriptWord[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startSec: startSec + index * step,
    endSec: startSec + index * step + step * 0.9,
    probability: 0.9,
  }));
}

describe("wrapCaption", () => {
  it("keeps short text on one line", () => {
    expect(wrapCaption("Halo semua")).toBe("Halo semua");
  });

  it("balances two lines without breaking words", () => {
    expect(wrapCaption("kenapa kita selalu takut gagal", 18)).toBe(
      "kenapa kita\nselalu takut gagal",
    );
  });
});

describe("buildCaptions", () => {
  it("closes captions at punctuation and at the word limit, relative to the clip start", () => {
    const captions = buildCaptions(
      words("Halo semua. Hari ini kita bahas satu hal penting", 100),
      100,
    );
    expect(captions.map((caption) => caption.text.replace("\n", " "))).toEqual([
      "Halo semua.",
      "Hari ini kita bahas satu",
      "hal penting",
    ]);
    expect(captions[0]!.startSec).toBe(0);
  });

  it("never lets a caption run across a sentence end, even after a single word", () => {
    // Regression: "sesuatu. Dan kapan itu" used to be one caption.
    const captions = buildCaptions(words("gagal melakukan sesuatu sesuatu. Dan kapan itu", 0), 0);
    const texts = captions.map((caption) => caption.text.replace("\n", " "));
    expect(texts.every((text) => !/\.\s\S/.test(text))).toBe(true);
    expect(texts).toContain("Dan kapan itu");
  });

  it("closes tiny gaps between captions to avoid flicker", () => {
    const captions = buildCaptions(words("Satu dua. Tiga empat.", 0), 0);
    expect(captions[0]!.endSec).toBe(captions[1]!.startSec);
  });

  it("respects the maximum caption duration", () => {
    const slow = words("pelan sekali bicaranya ya", 0, 1);
    expect(buildCaptions(slow, 0).length).toBeGreaterThan(1);
  });
});

describe("wordsInRange", () => {
  it("selects words by their midpoint", () => {
    const transcript = {
      language: "id",
      segments: [{ id: 0, startSec: 0, endSec: 3, text: "a b c", words: words("a b c", 0, 1) }],
    };
    expect(wordsInRange(transcript, 0.4, 2).map((word) => word.text)).toEqual(["a", "b"]);
  });
});
