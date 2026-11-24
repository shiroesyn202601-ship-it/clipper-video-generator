import { describe, expect, it } from "vitest";
import { assTime, buildAss, escapeAssText } from "./ass.ts";

describe("assTime", () => {
  it.each([
    [0, "0:00:00.00"],
    [1.234, "0:00:01.23"],
    [3725.5, "1:02:05.50"],
  ])("%s s → %s", (input, expected) => {
    expect(assTime(input)).toBe(expected);
  });
});

describe("escapeAssText", () => {
  it("neutralizes override tags and converts newlines", () => {
    expect(escapeAssText("{\\pos(0,0)}halo\nsemua")).toBe("(/pos(0,0))halo\\Nsemua");
  });
});

describe("buildAss", () => {
  const ass = buildAss(
    [
      { startSec: 0, endSec: 1.5, text: "Kenapa kita\ngagal?" },
      { startSec: 1.5, endSec: 1.5, text: "kosong" },
      { startSec: 2, endSec: 3, text: "   " },
    ],
    { style: "bold-center", width: 1080, height: 1920 },
  );

  it("declares the render resolution", () => {
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
  });

  it("keeps text above the bottom UI zone", () => {
    const style = ass.split("\n").find((line) => line.startsWith("Style: Default"))!;
    const marginV = Number(style.split(",").at(-2));
    expect(marginV).toBeGreaterThan(1920 * 0.15);
  });

  it("writes one dialogue line per non-empty caption", () => {
    const dialogues = ass.split("\n").filter((line) => line.startsWith("Dialogue:"));
    expect(dialogues).toEqual([
      "Dialogue: 0,0:00:00.00,0:00:01.50,Default,,0,0,0,,Kenapa kita\\Ngagal?",
    ]);
  });
});
