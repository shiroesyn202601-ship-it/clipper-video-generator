import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../lib/errors.ts";

/** Keep at most this many characters of stdout in memory (the rest goes to the log file). */
const MAX_CAPTURED_STDOUT_CHARS = 2_000_000;
/** Number of stderr lines attached to an error for diagnosis. */
const STDERR_TAIL_LINES = 20;

export type RunProcessOptions = {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Append stdout/stderr to this file. */
  logFile?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /** Data written to the child's stdin, then stdin is closed. */
  input?: string;
};

export type RunProcessResult = {
  exitCode: number;
  stdout: string;
  stderrTail: string[];
};

function processUserMessage(code: ProcessError["code"], command: string): string {
  if (code === "PROCESS_CANCELLED") return "Proses dibatalkan.";
  const name = path.basename(command).replace(/\.exe$/i, "");
  if (code === "PROCESS_NOT_FOUND") {
    return `Program ${name} tidak ditemukan. Buka halaman Status tools dan ikuti SETUP.md.`;
  }
  return `Program ${name} gagal dijalankan. Lihat log tahap ini untuk detail.`;
}

export class ProcessError extends AppError {
  readonly exitCode: number | null;
  readonly stderrTail: string[];

  constructor(options: {
    code: "PROCESS_NOT_FOUND" | "PROCESS_FAILED" | "PROCESS_CANCELLED";
    command: string;
    message: string;
    exitCode: number | null;
    stderrTail: string[];
    cause?: unknown;
  }) {
    super({
      code: options.code,
      message: options.message,
      userMessage: processUserMessage(options.code, options.command),
      cause: options.cause,
    });
    this.exitCode = options.exitCode;
    this.stderrTail = options.stderrTail;
  }
}

/**
 * Runs an external program without a shell. Arguments are passed as an array, so user input
 * can never be interpreted as shell syntax. Rejects with ProcessError on non-zero exit.
 */
export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const { command, args, signal } = options;
  if (signal?.aborted) throw cancelledError(command, []);

  let log: WriteStream | null = null;
  if (options.logFile) {
    await mkdir(path.dirname(options.logFile), { recursive: true });
    log = createWriteStream(options.logFile, { flags: "a" });
    log.write(`\n$ ${command} ${args.map(quoteForLog).join(" ")}\n`);
  }

  try {
    return await new Promise<RunProcessResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        // undefined → inherit the parent environment.
        env: options.env,
        shell: false,
        windowsHide: true,
        // POSIX: own process group so the whole tree can be killed on cancel.
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      const stderrTail: string[] = [];
      let isCancelled = false;

      const onAbort = (): void => {
        isCancelled = true;
        killTree(child.pid);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      splitLines(child.stdout, (line) => {
        if (stdout.length < MAX_CAPTURED_STDOUT_CHARS) stdout += line + "\n";
        log?.write(line + "\n");
        options.onStdoutLine?.(line);
      });
      splitLines(child.stderr, (line) => {
        stderrTail.push(line);
        if (stderrTail.length > STDERR_TAIL_LINES) stderrTail.shift();
        log?.write(line + "\n");
        options.onStderrLine?.(line);
      });

      if (options.input !== undefined) child.stdin.end(options.input);
      else child.stdin.end();

      child.on("error", (error: NodeJS.ErrnoException) => {
        signal?.removeEventListener("abort", onAbort);
        if (error.code === "ENOENT") {
          reject(
            new ProcessError({
              code: "PROCESS_NOT_FOUND",
              command,
              message: `Command not found: ${command}`,
              exitCode: null,
              stderrTail,
              cause: error,
            }),
          );
          return;
        }
        reject(error);
      });

      child.on("close", (exitCode) => {
        signal?.removeEventListener("abort", onAbort);
        if (isCancelled) {
          reject(cancelledError(command, stderrTail));
          return;
        }
        if (exitCode !== 0) {
          reject(
            new ProcessError({
              code: "PROCESS_FAILED",
              command,
              message: `${path.basename(command)} exited with code ${exitCode}: ${stderrTail.slice(-3).join(" | ")}`,
              exitCode,
              stderrTail,
            }),
          );
          return;
        }
        resolve({ exitCode, stdout, stderrTail });
      });
    });
  } finally {
    if (log) await new Promise<void>((resolve) => log.end(resolve));
  }
}

function cancelledError(command: string, stderrTail: string[]): ProcessError {
  return new ProcessError({
    code: "PROCESS_CANCELLED",
    command,
    message: `Cancelled: ${command}`,
    exitCode: null,
    stderrTail,
  });
}

/** Splits a stream into lines; handles both \n and \r (progress bars redraw with \r). */
function splitLines(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split(/\r\n|\n|\r/);
    buffer = parts.pop() ?? "";
    for (const part of parts) if (part.length > 0) onLine(part);
  });
  stream.on("end", () => {
    if (buffer.length > 0) onLine(buffer);
  });
}

function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Process group already gone.
  }
}

function quoteForLog(arg: string): string {
  return /[\s"]/.test(arg) ? JSON.stringify(arg) : arg;
}
