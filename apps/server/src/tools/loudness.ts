import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { runFfmpeg } from "./ffmpeg.ts";
import { ProcessError, runProcess } from "./run-process.ts";

const measurementSchema = z.object({ input_i: z.string(), input_tp: z.string() });

export type LoudnessTarget = { integratedLufs: number; truePeakDb: number };

/** Gentle speech compression (−20 dBFS threshold, 3:1) so the limiter barely has to work. */
const COMPRESSOR = "acompressor=threshold=0.1:ratio=3:attack=5:release=120";
/** Accept the result when it is this close to the target (LU). */
const TOLERANCE_LU = 0.5;
/** Gain correction rounds after the first attempt. */
const MAX_CORRECTIONS = 2;

/** Extracts the JSON block that `loudnorm=print_format=json` prints at the end of stderr. */
export function parseIntegratedLoudness(stderrLines: readonly string[]): number | null {
  const text = stderrLines.join("\n");
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = measurementSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return null;
    const value = Number(parsed.data.input_i);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** compressor → fixed gain → true-peak-safe limiter. */
export function normalizationFilter(gainDb: number, target: LoudnessTarget): string {
  const limit = Math.pow(10, target.truePeakDb / 20);
  return (
    `${COMPRESSOR},volume=${gainDb.toFixed(2)}dB,` +
    `alimiter=limit=${limit.toFixed(4)}:attack=5:release=50:level=false`
  );
}

async function measure(options: {
  config: Config;
  input: string;
  filter: string | null;
  signal: AbortSignal;
  logFile: string;
}): Promise<number> {
  const lines: string[] = [];
  const chain = options.filter ? `${options.filter},` : "";
  try {
    await runProcess({
      command: options.config.bins.ffmpeg,
      args: [
        "-hide_banner",
        "-nostdin",
        "-nostats",
        "-i",
        options.input,
        "-af",
        `${chain}loudnorm=print_format=json`,
        "-f",
        "null",
        "-",
      ],
      signal: options.signal,
      logFile: options.logFile,
      onStderrLine: (line) => {
        lines.push(line);
        if (lines.length > 200) lines.shift();
      },
    });
  } catch (error) {
    if (error instanceof ProcessError && error.code === "PROCESS_CANCELLED") throw error;
    throw loudnessError(error instanceof Error ? error.message : String(error), error);
  }
  const value = parseIntegratedLoudness(lines);
  if (value === null) throw loudnessError("loudnorm did not print a measurement");
  return value;
}

function loudnessError(message: string, cause?: unknown): AppError {
  return new AppError({
    code: "LOUDNESS_FAILED",
    message,
    userMessage: "Normalisasi loudness audio gagal. Lihat log.",
    cause,
  });
}

/**
 * Normalizes speech to the platform loudness target.
 *
 * loudnorm alone falls back to dynamic mode (and undershoots) when the needed gain would push
 * peaks over the true-peak limit, which is the normal case for speech. Instead: compress,
 * apply a measured gain, limit peaks, then measure the result and correct the gain until it is
 * within TOLERANCE_LU. Returns the final integrated loudness.
 */
export async function normalizeLoudness(options: {
  config: Config;
  input: string;
  output: string;
  durationSec: number;
  target: LoudnessTarget;
  signal: AbortSignal;
  logFile: string;
  onProgress?: (fraction: number) => void;
}): Promise<number> {
  const base = { config: options.config, signal: options.signal, logFile: options.logFile };
  const compressed = await measure({ ...base, input: options.input, filter: COMPRESSOR });
  if (compressed < -70) return compressed; // silence: nothing to normalize
  let gainDb = options.target.integratedLufs - compressed;
  let result = compressed;

  for (let attempt = 0; attempt <= MAX_CORRECTIONS; attempt++) {
    await runFfmpeg({
      ...base,
      args: [
        "-i",
        options.input,
        "-af",
        `${normalizationFilter(gainDb, options.target)},aresample=48000`,
        "-c:a",
        "pcm_s16le",
      ],
      outputPath: options.output,
      durationSec: options.durationSec,
      errorCode: "LOUDNESS_FAILED",
      userMessage: "Normalisasi loudness audio gagal. Lihat log.",
    });
    result = await measure({ ...base, input: options.output, filter: null });
    options.onProgress?.((attempt + 1) / (MAX_CORRECTIONS + 1));
    const miss = options.target.integratedLufs - result;
    if (Math.abs(miss) <= TOLERANCE_LU) break;
    gainDb += miss;
  }
  options.onProgress?.(1);
  return result;
}
