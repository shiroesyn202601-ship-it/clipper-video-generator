import { z } from "zod";
import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { ProcessError, runProcess } from "./run-process.ts";

const workerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), percent: z.number(), message: z.string() }),
  z.object({ type: z.literal("result"), outputs: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;

/** Parses one stdout line of the JSON Lines worker protocol; non-protocol lines return null. */
export function parseWorkerLine(line: string): WorkerMessage | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = workerMessageSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type RunWorkerOptions = {
  config: Config;
  /** Module name inside clipper_workers, e.g. "separate_vocals". */
  module: string;
  args: string[];
  signal: AbortSignal;
  logFile: string;
  onProgress?: (fraction: number, message: string) => void;
  /** Maps worker error codes to Indonesian messages; `default` is used otherwise. */
  userMessages: { default: string } & Record<string, string>;
  errorCode: string;
};

/**
 * Runs `python -m clipper_workers.<module>` and speaks the JSON Lines protocol
 * (see workers/clipper_workers/common/io.py). Resolves with the worker's outputs.
 */
export async function runWorker(options: RunWorkerOptions): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | null = null;
  let workerError: { code: string; message: string } | null = null;

  try {
    await runProcess({
      command: options.config.bins.python,
      args: ["-m", `clipper_workers.${options.module}`, ...options.args],
      cwd: options.config.workersDir,
      env: options.config.pythonEnv,
      signal: options.signal,
      logFile: options.logFile,
      onStdoutLine: (line) => {
        const message = parseWorkerLine(line);
        if (!message) return;
        if (message.type === "progress") options.onProgress?.(message.percent / 100, message.message);
        else if (message.type === "result") result = message.outputs;
        else workerError = { code: message.code, message: message.message };
      },
    });
  } catch (error) {
    if (error instanceof ProcessError && error.code === "PROCESS_CANCELLED") throw error;
    const reported = workerError as { code: string; message: string } | null;
    throw new AppError({
      code: options.errorCode,
      message: reported
        ? `${reported.code}: ${reported.message}`
        : error instanceof Error
          ? error.message
          : String(error),
      userMessage:
        (reported ? options.userMessages[reported.code] : undefined) ?? options.userMessages.default,
      cause: error,
    });
  }

  if (!result) {
    throw new AppError({
      code: options.errorCode,
      message: `Worker ${options.module} exited without a result message`,
      userMessage: options.userMessages.default,
    });
  }
  return result;
}

/** Reads a string path from worker outputs, failing loudly if the worker broke its contract. */
export function outputPath(outputs: Record<string, unknown>, key: string): string {
  const value = outputs[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError({
      code: "WORKER_CONTRACT",
      message: `Worker output "${key}" missing or not a string`,
      userMessage: "Worker Python mengembalikan hasil yang tidak lengkap. Lihat log.",
    });
  }
  return value;
}
