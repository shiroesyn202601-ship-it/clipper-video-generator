import { CAPTION_PRESETS, DEFAULT_CAPTION_STYLE } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { assStyleColor, assTagColor, buildStyledAss, timeWords } from "./styled-ass.ts";

describe("colours", () => {
  it("converts #RRGGBB to ASS BGR order", () => {
    expect(assStyleColor("#FFE600")).toBe("&H0000E6FF");
    expect(assStyleColor("#000000", 0.6)).toBe("&H66000000");
    expect(assTagColor("#7B2FF7")).toBe("&HF72F7B&");
  });
});

describe("timeWords", () => {
  it("spreads the caption range over the words and keeps line breaks", () => {
    const words = timeWords({ startSec: 1, endSec: 3, text: "aku\nsuka kopi" });
    expect(words.map((word) => [word.text, word.breaksLine])).toEqual([
      ["aku", false],
      ["suka", true],
      ["kopi", false],
    ]);
    expect(words[0]?.startSec).toBe(1);
    expect(words.at(-1)?.endSec).toBe(3);
    words.slice(1).forEach((word, index) => {
      expect(word.startSec).toBe(words[index]?.endSec);
    });
  });
});

const size = { width: 1080, height: 1920 };
const captions = [{ startSec: 0, endSec: 1.2, text: "halo {semua}" }];

describe("buildStyledAss", () => {
  it("moves the highlight word by word", () => {
    const ass = buildStyledAss(captions, { style: DEFAULT_CAPTION_STYLE, ...size });
    const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(events).toHaveLength(2);
    expect(events[0]).toContain("\\1c&H00E6FF&");
    expect(ass).toContain("Style: Default,Montserrat ExtraBold,80,");
    // uppercase and braces neutralized
    expect(ass).toContain("HALO");
    expect(ass).toContain("(SEMUA)");
    expect(ass).not.toContain("{SEMUA}");
  });

  it("writes one karaoke event per caption", () => {
    const ass = buildStyledAss(captions, { style: CAPTION_PRESETS.karaoke, ...size });
    const events = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatch(/\\kf\d+/);
  });

  it("uses an opaque box style for the boxed preset", () => {
    const ass = buildStyledAss(captions, { style: CAPTION_PRESETS["clean-box"], ...size });
    expect(ass).toMatch(/Style: Default,Poppins Bold,64,.*,0,0,0,0,100,100,0,0,3,14,0,5,/);
  });
});
