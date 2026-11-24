import { clipCommentarySchema, hasCommentary } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { LEAD_SEC, commentaryCaptions, shiftCaptions, timelineFilter } from "./timeline.ts";

describe("hasCommentary", () => {
  it("is false for old clips, disabled commentary, and empty text", () => {
    expect(hasCommentary(null)).toBe(false);
    expect(hasCommentary(clipCommentarySchema.parse({ intro: "Halo", enabled: false }))).toBe(false);
    expect(hasCommentary(clipCommentarySchema.parse({ intro: "  " }))).toBe(false);
    expect(hasCommentary(clipCommentarySchema.parse({ outro: "Setuju?" }))).toBe(true);
  });
});

describe("commentaryCaptions", () => {
  it("places the voice words after the segment start and the lead-in", () => {
    const captions = commentaryCaptions(
      [
        { text: "Coba", startSec: 0, endSec: 0.4 },
        { text: "dengar.", startSec: 0.4, endSec: 0.9 },
      ],
      10,
    );
    expect(LEAD_SEC).toBe(0.15);
    expect(captions).toEqual([{ startSec: 10.15, endSec: 11.05, text: "Coba dengar." }]);
  });
});

describe("shiftCaptions", () => {
  it("moves clip captions after the intro", () => {
    expect(shiftCaptions([{ startSec: 1, endSec: 2, text: "a" }], 3)).toEqual([
      { startSec: 4, endSec: 5, text: "a" },
    ]);
  });
});

describe("timelineFilter", () => {
  const base = { mainDurationSec: 30, width: 1080, height: 1920, fps: 30 };

  it("joins intro, clip, and outro in order", () => {
    const filter = timelineFilter({
      ...base,
      parts: [
        { name: "intro", audio: "commentary/intro.mp3", words: [], durationSec: 3 },
        { name: "outro", audio: "commentary/outro.mp3", words: [], durationSec: 5 },
      ],
    });
    expect(filter).toContain("[2:v]scale=1080:1920,boxblur=22:2");
    expect(filter).toContain("[3:a]aresample=48000");
    expect(filter).toContain("[5:a]");
    expect(filter.endsWith("[vintro][aintro][vmain][amain][voutro][aoutro]concat=n=3:v=1:a=1[vout][aout]")).toBe(
      true,
    );
  });

  it("handles an outro only", () => {
    const filter = timelineFilter({
      ...base,
      parts: [{ name: "outro", audio: "commentary/outro.mp3", words: [], durationSec: 5 }],
    });
    expect(filter.endsWith("[vmain][amain][voutro][aoutro]concat=n=2:v=1:a=1[vout][aout]")).toBe(true);
  });
});
