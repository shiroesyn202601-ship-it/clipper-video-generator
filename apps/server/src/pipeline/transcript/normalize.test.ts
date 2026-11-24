import { describe, expect, it } from "vitest";
import { normalizeWhisper, tokensToWords, transcriptToVtt, type WhisperRaw } from "./normalize.ts";

const token = (text: string, from: number, to: number, p = 0.9) => ({
  text,
  offsets: { from, to },
  p,
});

const raw: WhisperRaw = {
  result: { language: "id" },
  transcription: [
    {
      offsets: { from: 0, to: 2000 },
      text: " Kenapa kita gagal?",
      tokens: [
        token("[_BEG_]", 0, 0),
        token(" Ken", 100, 300, 0.8),
        token("apa", 300, 500, 1),
        token(" kita", 500, 800),
        token(" gagal", 800, 1300),
        token("?", 1300, 1400, 0.5),
        token("[_TT_70]", 1400, 1400),
      ],
    },
    {
      offsets: { from: 2000, to: 3000 },
      text: " Kenapa kita gagal?",
      tokens: [
        token(" Kenapa", 2000, 2400),
        token(" kita", 2400, 2600),
        token(" gagal?", 2600, 3000),
      ],
    },
    {
      offsets: { from: 3000, to: 4000 },
      text: " [Musik]",
      tokens: [token(" [Musik]", 3000, 4000)],
    },
    {
      offsets: { from: 4000, to: 5000 },
      text: " Karena takut.",
      tokens: [token(" Karena", 4000, 4400), token(" takut", 4400, 4900), token(".", 4900, 5000)],
    },
  ],
};

describe("tokensToWords", () => {
  it("joins sub-word tokens and attaches punctuation to the previous word", () => {
    const words = tokensToWords(raw.transcription[0]!.tokens);
    expect(words.map((word) => word.text)).toEqual(["Kenapa", "kita", "gagal?"]);
    expect(words[0]).toEqual({ text: "Kenapa", startSec: 0.1, endSec: 0.5, probability: 0.9 });
    // punctuation extends the timing but does not change the confidence
    expect(words[2]).toMatchObject({ endSec: 1.4, probability: 0.9 });
  });
});

describe("normalizeWhisper", () => {
  const transcript = normalizeWhisper(raw, "auto");

  it("drops repeated segments and non-speech annotations", () => {
    expect(transcript.segments.map((segment) => segment.text)).toEqual([
      "Kenapa kita gagal?",
      "Karena takut.",
    ]);
  });

  it("numbers segments and uses word timings for segment bounds", () => {
    expect(transcript.segments[1]).toMatchObject({ id: 1, startSec: 4, endSec: 5 });
    expect(transcript.language).toBe("id");
  });

  it("renders WebVTT cues", () => {
    expect(transcriptToVtt(transcript)).toBe(
      "WEBVTT\n\n00:00:00.100 --> 00:00:01.400\nKenapa kita gagal?\n\n00:00:04.000 --> 00:00:05.000\nKarena takut.\n",
    );
  });
});
