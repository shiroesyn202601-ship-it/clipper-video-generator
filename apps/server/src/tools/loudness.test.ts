import { describe, expect, it } from "vitest";
import { normalizationFilter, parseIntegratedLoudness } from "./loudness.ts";

const stderr = [
  "[Parsed_loudnorm_0 @ 000001] ",
  "{",
  '\t"input_i" : "-23.54",',
  '\t"input_tp" : "-6.20",',
  '\t"input_lra" : "5.10",',
  '\t"target_offset" : "0.10"',
  "}",
];

describe("loudness helpers", () => {
  it("parses the integrated loudness printed by loudnorm", () => {
    expect(parseIntegratedLoudness(stderr)).toBe(-23.54);
    expect(parseIntegratedLoudness(["no json here"])).toBeNull();
  });

  it("builds compressor → gain → limiter with the true-peak limit in linear scale", () => {
    expect(normalizationFilter(9.5, { integratedLufs: -14, truePeakDb: -1.5 })).toBe(
      "acompressor=threshold=0.1:ratio=3:attack=5:release=120,volume=9.50dB,alimiter=limit=0.8414:attack=5:release=50:level=false",
    );
  });
});
