import { describe, expect, it } from "vitest";
import {
  normalizeGroq,
  parseSilences,
  planChunks,
  punctuateWords,
  toLanguageCode,
  type GroqRaw,
} from "./groq.ts";

describe("punctuateWords", () => {
  it("takes the punctuated spelling from the segment text", () => {
    expect(punctuateWords(["kenapa", "kita", "gagal"], " Kenapa kita gagal?")).toEqual([
      "Kenapa",
      "kita",
      "gagal?",
    ]);
  });

  it("keeps the raw word when the text does not match", () => {
    expect(punctuateWords(["halo", "dunia"], "Halo, semua.")).toEqual(["Halo,", "dunia"]);
  });
});

describe("toLanguageCode", () => {
  it("maps Whisper language names to codes", () => {
    expect(toLanguageCode("Indonesian", "auto")).toBe("id");
    expect(toLanguageCode("en", "auto")).toBe("en");
    expect(toLanguageCode("klingon", "id")).toBe("id");
    expect(toLanguageCode(undefined, "id")).toBe("id");
  });
});

describe("normalizeGroq", () => {
  const first: GroqRaw = {
    language: "indonesian",
    segments: [
      { start: 0, end: 2, text: " Kenapa kita gagal?", avg_logprob: -0.1, no_speech_prob: 0.01 },
      { start: 2, end: 3, text: " Kenapa kita gagal?", avg_logprob: -0.1 },
      { start: 3, end: 4, text: " [Musik]", avg_logprob: -0.5 },
      { start: 4, end: 5, text: " hmm", no_speech_prob: 0.95 },
    ],
    words: [
      { word: "Kenapa", start: 0.1, end: 0.5 },
      { word: "kita", start: 0.5, end: 0.8 },
      { word: "gagal", start: 0.8, end: 1.4 },
      { word: "Kenapa", start: 2, end: 2.4 },
      { word: "kita", start: 2.4, end: 2.6 },
      { word: "gagal", start: 2.6, end: 3 },
      { word: "Musik", start: 3, end: 4 },
      { word: "hmm", start: 4.1, end: 4.5 },
    ],
  };
  const second: GroqRaw = {
    segments: [{ start: 0.5, end: 1.5, text: " Karena takut.", avg_logprob: -0.2 }],
    words: [
      { word: "Karena", start: 0.5, end: 0.9 },
      { word: "takut", start: 0.9, end: 1.5 },
    ],
  };
  const transcript = normalizeGroq(
    [
      { offsetSec: 0, raw: first },
      { offsetSec: 600, raw: second },
    ],
    "auto",
  );

  it("drops repeats, annotations, and silence", () => {
    expect(transcript.segments.map((segment) => segment.text)).toEqual([
      "Kenapa kita gagal?",
      "Karena takut.",
    ]);
    expect(transcript.language).toBe("id");
  });

  it("shifts later pieces by their offset and restores punctuation", () => {
    expect(transcript.segments[0]?.words.map((word) => word.text)).toEqual([
      "Kenapa",
      "kita",
      "gagal?",
    ]);
    expect(transcript.segments[1]).toMatchObject({ id: 1, startSec: 600.5, endSec: 601.5 });
    expect(transcript.segments[0]?.words[0]?.probability).toBeCloseTo(Math.exp(-0.1), 3);
  });
});

describe("parseSilences", () => {
  it("returns the middle of each silence", () => {
    const lines = [
      "[silencedetect @ 0x1] silence_start: 10.5",
      "[silencedetect @ 0x1] silence_end: 11.5 | silence_duration: 1",
      "[silencedetect @ 0x1] silence_start: -0.01",
      "[silencedetect @ 0x1] silence_end: 0.4 | silence_duration: 0.41",
    ];
    expect(parseSilences(lines)).toEqual([11, 0.2]);
  });
});

describe("planChunks", () => {
  it("cuts in the silence closest to each target", () => {
    expect(planChunks(1500, [580, 610, 1150, 1230], 600, 60)).toEqual([
      { startSec: 0, endSec: 610 },
      { startSec: 610, endSec: 1230 },
      { startSec: 1230, endSec: 1500 },
    ]);
  });

  it("cuts at the target when there is no silence nearby", () => {
    expect(planChunks(1200, [], 600, 60)).toEqual([
      { startSec: 0, endSec: 600 },
      { startSec: 600, endSec: 1200 },
    ]);
  });

  it("keeps short audio in one piece", () => {
    expect(planChunks(300, [100], 600, 60)).toEqual([{ startSec: 0, endSec: 300 }]);
  });
});
