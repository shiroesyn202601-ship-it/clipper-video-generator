import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { ProcessError, runProcess } from "./run-process.ts";

/** "whisper_print_progress_callback: progress =  45%" → 0.45 */
export function parseWhisperProgress(line: string): number | null {
  const match = /progress\s*=\s*(\d+)%/.exec(line);
  if (!match?.[1]) return null;
  return Math.min(1, Number(match[1]) / 100);
}

/**
 * Runs whisper-cli on a 16 kHz mono WAV and writes `<outputBase>.json` (full JSON with
 * per-token timestamps).
 */
export async function transcribeWav(options: {
  config: Config;
  wavPath: string;
  outputBase: string;
  language: string;
  signal: AbortSignal;
  logFile: string;
  onProgress: (fraction: number) => void;
}): Promise<string> {
  const { config } = options;
  try {
    await runProcess({
      command: config.bins.whisper,
      args: [
        "--model",
        config.whisper.model,
        "--file",
        options.wavPath,
        "--language",
        options.language,
        "--threads",
        String(config.whisper.threads),
        "--output-json-full",
        "--output-file",
        options.outputBase,
        "--print-progress",
        // Suppress non-speech tokens ([Music], (laughs)...) which pollute subtitles.
        "--suppress-nst",
      ],
      signal: options.signal,
      logFile: options.logFile,
      onStderrLine: (line) => {
        const fraction = parseWhisperProgress(line);
        if (fraction !== null) options.onProgress(fraction);
      },
    });
  } catch (error) {
    if (error instanceof ProcessError && error.code === "PROCESS_CANCELLED") throw error;
    throw new AppError({
      code: "WHISPER_FAILED",
      message: error instanceof Error ? error.message : String(error),
      userMessage:
        error instanceof ProcessError && error.code === "PROCESS_NOT_FOUND"
          ? "whisper.cpp tidak ditemukan. Ikuti SETUP.md langkah 4."
          : "Transkrip (whisper.cpp) gagal. Lihat log.",
      cause: error,
    });
  }
  return `${options.outputBase}.json`;
}
