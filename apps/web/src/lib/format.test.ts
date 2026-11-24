import { elapsedSec, formatDuration, formatTimestamp, toPercent } from "./format.ts";

describe("format", () => {
  it.each([
    [0, "0:00"],
    [75.4, "1:15"],
    [3725, "1:02:05"],
  ])("formatDuration(%s) = %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });

  it("formats timestamps with tenths", () => {
    expect(formatTimestamp(75.43)).toBe("1:15.4");
  });

  it("clamps percentages", () => {
    expect(toPercent(1.4)).toBe(100);
    expect(toPercent(0.456)).toBe(46);
  });

  it("computes elapsed time", () => {
    expect(elapsedSec("2026-01-01T00:00:00Z", "2026-01-01T00:01:30Z")).toBe(90);
  });
});
