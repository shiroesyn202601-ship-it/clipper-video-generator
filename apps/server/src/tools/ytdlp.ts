import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { readJson } from "../lib/fs-utils.ts";
import { ProcessError, runProcess } from "./run-process.ts";

const PROGRESS_PREFIX = "CLIPPER_PROGRESS";
/** Video and audio are downloaded separately, then merged. */
const EXPECTED_PARTS = 2;

const infoSchema = z
  .object({
    title: z.string().optional(),
    duration: z.number().optional(),
  })
  .passthrough();

/** Parses our --progress-template line: "CLIPPER_PROGRESS  42.3%" → 0.423 */
export function parseYtdlpProgress(line: string): number | null {
  if (!line.startsWith(PROGRESS_PREFIX)) return null;
  const match = /([\d.]+)%/.exec(line);
  if (!match?.[1]) return null;
  const percent = Number(match[1]);
  return Number.isFinite(percent) ? Math.min(1, percent / 100) : null;
}

/** Combines per-file progress into one monotonic fraction across the expected parts. */
export function createDownloadProgress(onProgress: (fraction: number) => void) {
  let part = 0;
  let lastPartFraction = 0;
  let best = 0;
  return {
    onLine(line: string): void {
      if (line.includes("[download] Destination:")) {
        if (lastPartFraction > 0) part = Math.min(part + 1, EXPECTED_PARTS - 1);
        lastPartFraction = 0;
        return;
      }
      const fraction = parseYtdlpProgress(line);
      if (fraction === null) return;
      lastPartFraction = fraction;
      const overall = Math.min(0.99, (part + fraction) / EXPECTED_PARTS);
      if (overall > best) {
        best = overall;
        onProgress(overall);
      }
    },
  };
}

/** Last "ERROR: ..." line from yt-dlp, which explains the failure in plain English. */
export function extractYtdlpError(stderrTail: readonly string[]): string | null {
  const line = [...stderrTail].reverse().find((item) => item.startsWith("ERROR:"));
  return line ? line.replace(/^ERROR:\s*/, "").slice(0, 300) : null;
}

export type DownloadResult = {
  videoPath: string;
  infoPath: string | null;
  title: string | null;
  durationSec: number | null;
};

export async function downloadVideo(options: {
  config: Config;
  url: string;
  outDir: string;
  signal: AbortSignal;
  logFile: string;
  onProgress: (fraction: number) => void;
}): Promise<DownloadResult> {
  const { config, url, outDir } = options;
  const progress = createDownloadProgress(options.onProgress);
  const isPath = (bin: string): boolean => bin.includes("/") || bin.includes("\\");

  const args = [
    "--no-playlist",
    "--no-mtime",
    "--newline",
    "--format",
    "bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b",
    "--merge-output-format",
    "mp4",
    "--remux-video",
    "mp4",
    "--write-info-json",
    "--paths",
    outDir,
    "--output",
    "source.%(ext)s",
    "--progress-template",
    `download:${PROGRESS_PREFIX} %(progress._percent_str)s`,
    ...(isPath(config.bins.ffmpeg) ? ["--ffmpeg-location", path.dirname(config.bins.ffmpeg)] : []),
    // YouTube requires solving JS challenges; yt-dlp-ejs runs them with Deno.
    "--js-runtimes",
    isPath(config.bins.deno) ? `deno:${config.bins.deno}` : "deno",
    // "--" ends option parsing: the URL can never be read as a flag.
    "--",
    url,
  ];

  try {
    await runProcess({
      command: config.bins.ytdlp,
      args,
      signal: options.signal,
      logFile: options.logFile,
      onStdoutLine: (line) => progress.onLine(line),
    });
  } catch (error) {
    if (error instanceof ProcessError && error.code === "PROCESS_CANCELLED") throw error;
    const reason = error instanceof ProcessError ? extractYtdlpError(error.stderrTail) : null;
    throw new AppError({
      code: error instanceof ProcessError && error.code === "PROCESS_NOT_FOUND" ? "YTDLP_MISSING" : "YTDLP_FAILED",
      message: reason ?? (error instanceof Error ? error.message : String(error)),
      userMessage:
        "Video tidak bisa diunduh. Pastikan URL publik dan yt-dlp versi terbaru" +
        (reason ? ` (${reason})` : "."),
      cause: error,
    });
  }

  const files = await readdir(outDir);
  const videoFile = files.find((file) => /^source\.(mp4|mkv|webm|mov)$/i.test(file));
  if (!videoFile) {
    throw new AppError({
      code: "YTDLP_NO_OUTPUT",
      message: `yt-dlp finished but no video file in ${outDir}: ${files.join(", ")}`,
      userMessage: "Unduhan selesai tetapi file video tidak ditemukan. Lihat log.",
    });
  }
  const infoFile = files.find((file) => file.endsWith(".info.json"));
  const infoPath = infoFile ? path.join(outDir, infoFile) : null;
  const info = infoPath ? await readJson(infoPath, infoSchema).catch(() => null) : null;

  return {
    videoPath: path.join(outDir, videoFile),
    infoPath,
    title: info?.title ?? null,
    durationSec: info?.duration ?? null,
  };
}
