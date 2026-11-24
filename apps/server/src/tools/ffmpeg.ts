import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { ProcessError, runProcess } from "./run-process.ts";

const probeSchema = z.object({
  format: z.object({ duration: z.string().optional() }).passthrough(),
  streams: z.array(
    z
      .object({
        codec_type: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        r_frame_rate: z.string().optional(),
      })
      .passthrough(),
  ),
});

export type MediaInfo = {
  durationSec: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
};

/** "30000/1001" → 29.97 */
export function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null;
  const [num, den] = value.split("/").map(Number);
  if (num === undefined || !Number.isFinite(num)) return null;
  const rate = den ? num / den : num;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function probeMedia(config: Config, filePath: string): Promise<MediaInfo> {
  try {
    const { stdout } = await runProcess({
      command: config.bins.ffprobe,
      args: ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", "--", filePath],
    });
    const probe = probeSchema.parse(JSON.parse(stdout));
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    return {
      durationSec: Number(probe.format.duration ?? 0),
      hasVideo: video !== undefined,
      hasAudio: probe.streams.some((stream) => stream.codec_type === "audio"),
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: parseFrameRate(video?.r_frame_rate),
    };
  } catch (error) {
    throw new AppError({
      code: "PROBE_FAILED",
      message: `ffprobe failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      userMessage: "File video tidak bisa dibaca. Pastikan formatnya didukung (MP4, MKV, MOV, WEBM).",
      cause: error,
    });
  }
}

/** Parses one line of `ffmpeg -progress pipe:1` output into seconds processed, if present. */
export function parseFfmpegProgressLine(line: string): number | null {
  const match = /^out_time_(?:us|ms)=(\d+)$/.exec(line.trim());
  if (!match?.[1]) return null;
  // Both keys are microseconds (out_time_ms is misnamed in ffmpeg).
  return Number(match[1]) / 1_000_000;
}

export type RunFfmpegOptions = {
  config: Config;
  /** Arguments after the global flags; the last one must be the output path. */
  args: string[];
  /** Final output file; ffmpeg writes to a temp name first, then it is renamed. */
  outputPath: string;
  /** Expected output duration, used to compute progress. */
  durationSec: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  logFile?: string;
  errorCode: string;
  userMessage: string;
};

/**
 * Runs ffmpeg with machine-readable progress. Output goes to a temp file that is renamed on
 * success, so a half-written file never looks finished.
 */
export async function runFfmpeg(options: RunFfmpegOptions): Promise<void> {
  const { config, outputPath, durationSec } = options;
  const extension = path.extname(outputPath);
  const tempPath = `${outputPath.slice(0, -extension.length)}.partial${extension}`;
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-progress",
    "pipe:1",
    "-nostats",
    "-loglevel",
    "error",
    ...options.args,
    tempPath,
  ];
  try {
    await runProcess({
      command: config.bins.ffmpeg,
      args,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.logFile ? { logFile: options.logFile } : {}),
      onStdoutLine: (line) => {
        const seconds = parseFfmpegProgressLine(line);
        if (seconds !== null && durationSec > 0) {
          options.onProgress?.(Math.min(1, seconds / durationSec));
        }
      },
    });
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    if (error instanceof ProcessError && error.code === "PROCESS_CANCELLED") throw error;
    throw new AppError({
      code: options.errorCode,
      message: error instanceof Error ? error.message : String(error),
      userMessage: options.userMessage,
      cause: error,
    });
  }
}
