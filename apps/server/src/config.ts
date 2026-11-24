import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./lib/repo-root.ts";

const envFile = path.join(REPO_ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const isWindows = process.platform === "win32";
const venvBin = isWindows ? "./.venv/Scripts" : "./.venv/bin";
const exe = isWindows ? ".exe" : "";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(5174),
  WORKSPACE_DIR: z.string().default("./workspace"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(8192),
  PYTHON_BIN: z.string().default(`${venvBin}/python${exe}`),
  YTDLP_BIN: z.string().default(`${venvBin}/yt-dlp${exe}`),
  FFMPEG_BIN: z.string().default("ffmpeg"),
  FFPROBE_BIN: z.string().default("ffprobe"),
  DENO_BIN: z.string().default("deno"),
  WHISPER_BIN: z.string().default(
    // Windows uses the official prebuilt release; macOS/Linux build from source (SETUP.md §4).
    isWindows ? "./tools/whisper-bin/whisper-cli.exe" : "./tools/whisper.cpp/build/bin/whisper-cli",
  ),
  WHISPER_MODEL: z.string().default("./tools/whisper.cpp/models/ggml-medium.bin"),
  WHISPER_THREADS: z.coerce.number().int().positive().default(4),
  FACE_MODEL: z.string().default("./tools/models/face_detection_yunet_2023mar.onnx"),
  DEMUCS_MODEL: z.string().default("htdemucs"),
  DEMUCS_DEVICE: z.enum(["cpu", "cuda"]).default("cpu"),
});

/** Resolves a path from .env against the repo root; bare command names stay as-is (PATH lookup). */
function resolveBin(value: string): string {
  const looksLikePath = value.includes("/") || value.includes("\\");
  return looksLikePath ? path.resolve(REPO_ROOT, value) : value;
}

function loadConfig() {
  const env = envSchema.parse(process.env);
  return Object.freeze({
    isProduction: env.NODE_ENV === "production",
    host: "127.0.0.1",
    port: env.SERVER_PORT,
    repoRoot: REPO_ROOT,
    workspaceDir: path.resolve(REPO_ROOT, env.WORKSPACE_DIR),
    webDistDir: path.join(REPO_ROOT, "apps", "web", "dist"),
    maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
    bins: Object.freeze({
      python: resolveBin(env.PYTHON_BIN),
      ytdlp: resolveBin(env.YTDLP_BIN),
      ffmpeg: resolveBin(env.FFMPEG_BIN),
      ffprobe: resolveBin(env.FFPROBE_BIN),
      deno: resolveBin(env.DENO_BIN),
      whisper: resolveBin(env.WHISPER_BIN),
    }),
    whisper: Object.freeze({
      model: path.resolve(REPO_ROOT, env.WHISPER_MODEL),
      threads: env.WHISPER_THREADS,
    }),
    faceModel: path.resolve(REPO_ROOT, env.FACE_MODEL),
    demucs: Object.freeze({ model: env.DEMUCS_MODEL, device: env.DEMUCS_DEVICE }),
    workersDir: path.join(REPO_ROOT, "workers"),
    /** Environment for Python workers: UTF-8 I/O and unbuffered stdout for live progress. */
    pythonEnv: Object.freeze({
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
    }),
  });
}

export type Config = ReturnType<typeof loadConfig>;
export const config: Config = loadConfig();
