import { describe, expect, it } from "vitest";
import { parseFfmpegProgressLine, parseFrameRate } from "./ffmpeg.ts";
import { createDownloadProgress, extractYtdlpError, parseYtdlpProgress } from "./ytdlp.ts";

describe("ffmpeg parsers", () => {
  it("reads out_time_us in seconds", () => {
    expect(parseFfmpegProgressLine("out_time_us=12500000")).toBe(12.5);
    expect(parseFfmpegProgressLine("out_time_ms=1000000")).toBe(1);
    expect(parseFfmpegProgressLine("frame=10")).toBeNull();
  });

  it("parses fractional frame rates", () => {
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseFrameRate("25/1")).toBe(25);
    expect(parseFrameRate("0/0")).toBeNull();
  });
});

describe("yt-dlp parsers", () => {
  it("parses the progress template", () => {
    expect(parseYtdlpProgress("CLIPPER_PROGRESS  42.5%")).toBeCloseTo(0.425);
    expect(parseYtdlpProgress("[download] 42.5% of 10MiB")).toBeNull();
  });

  it("combines video and audio parts into monotonic progress", () => {
    const values: number[] = [];
    const progress = createDownloadProgress((value) => values.push(value));
    progress.onLine("[download] Destination: source.f137.mp4");
    progress.onLine("CLIPPER_PROGRESS 50.0%");
    progress.onLine("CLIPPER_PROGRESS 100.0%");
    progress.onLine("[download] Destination: source.f140.m4a");
    progress.onLine("CLIPPER_PROGRESS 10.0%");
    progress.onLine("CLIPPER_PROGRESS 100.0%");
    expect(values).toEqual([0.25, 0.5, 0.55, 0.99]);
  });

  it("extracts the last ERROR line", () => {
    expect(
      extractYtdlpError(["WARNING: x", "ERROR: [youtube] abc: Video unavailable", "other"]),
    ).toBe("[youtube] abc: Video unavailable");
    expect(extractYtdlpError(["nothing"])).toBeNull();
  });
});
