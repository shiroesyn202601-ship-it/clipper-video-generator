import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { HealthReport, ToolId, ToolStatus } from "@clipper/shared";
import type { Config } from "../config.ts";
import { errorMessage } from "../lib/errors.ts";
import { runProcess } from "./run-process.ts";

type PythonPackage = { id: ToolId; module: string; distribution: string; label: string };

const PYTHON_PACKAGES: readonly PythonPackage[] = [
  { id: "demucs", module: "demucs", distribution: "demucs", label: "Demucs" },
  { id: "deepfilternet", module: "df", distribution: "deepfilternet", label: "DeepFilterNet" },
  { id: "opencv", module: "cv2", distribution: "opencv-python", label: "OpenCV" },
  { id: "norfair", module: "norfair", distribution: "norfair", label: "Norfair" },
];

// find_spec + metadata avoids importing torch, which would take seconds.
const PYTHON_PROBE_SCRIPT = [
  "import importlib.util, importlib.metadata, json, sys",
  "result = {}",
  "for module, dist in json.loads(sys.argv[1]):",
  "    found = importlib.util.find_spec(module) is not None",
  "    try:",
  "        version = importlib.metadata.version(dist)",
  "    except Exception:",
  "        version = None",
  "    result[module] = {'found': found, 'version': version}",
  "print(json.dumps(result))",
].join("\n");

/** Checks every external tool the pipeline needs. Never throws: failures become entries. */
export async function checkHealth(config: Config): Promise<HealthReport> {
  const groups = await Promise.all([
    checkCommand("ffmpeg", "ffmpeg", config.bins.ffmpeg, ["-version"], versionAfterWord),
    checkCommand("ffprobe", "ffprobe", config.bins.ffprobe, ["-version"], versionAfterWord),
    checkCommand("yt-dlp", "yt-dlp", config.bins.ytdlp, ["--version"], firstLine),
    checkCommand("deno", "Deno (untuk YouTube)", config.bins.deno, ["--version"], versionAfterWord),
    checkFile("whisper", "whisper.cpp", config.bins.whisper),
    checkFile("whisper-model", "Model Whisper", config.whisper.model),
    checkCommand("python", "Python", config.bins.python, ["--version"], firstLine),
    checkPythonPackages(config.bins.python),
    checkFile("face-model", "Model wajah YuNet", config.faceModel),
    checkEditly(config.repoRoot),
  ]);
  const tools = groups.flat();
  return { isReady: tools.every((tool) => tool.isAvailable), tools };
}

async function checkCommand(
  id: ToolId,
  label: string,
  command: string,
  args: string[],
  parseVersion: (stdout: string) => string,
): Promise<ToolStatus> {
  try {
    const { stdout } = await runProcess({ command, args });
    return { id, label, isAvailable: true, version: parseVersion(stdout), detail: null };
  } catch (error) {
    return { id, label, isAvailable: false, version: null, detail: errorMessage(error) };
  }
}

async function checkFile(id: ToolId, label: string, filePath: string): Promise<ToolStatus> {
  try {
    const info = await stat(filePath);
    return { id, label, isAvailable: true, version: null, detail: formatSize(info.size) };
  } catch {
    return { id, label, isAvailable: false, version: null, detail: `Tidak ditemukan: ${filePath}` };
  }
}

async function checkPythonPackages(python: string): Promise<ToolStatus[]> {
  const pairs = PYTHON_PACKAGES.map((pkg) => [pkg.module, pkg.distribution]);
  try {
    const { stdout } = await runProcess({
      command: python,
      args: ["-c", PYTHON_PROBE_SCRIPT, JSON.stringify(pairs)],
    });
    const parsed = JSON.parse(stdout) as Record<
      string,
      { found: boolean; version: string | null } | undefined
    >;
    return PYTHON_PACKAGES.map((pkg) => {
      const info = parsed[pkg.module];
      const isAvailable = info?.found === true;
      return {
        id: pkg.id,
        label: pkg.label,
        isAvailable,
        version: info?.version ?? null,
        detail: isAvailable ? null : `Paket Python "${pkg.distribution}" belum terpasang di .venv`,
      };
    });
  } catch (error) {
    return PYTHON_PACKAGES.map((pkg) => ({
      id: pkg.id,
      label: pkg.label,
      isAvailable: false,
      version: null,
      detail: `Python tidak bisa dijalankan: ${errorMessage(error)}`,
    }));
  }
}

async function checkEditly(repoRoot: string): Promise<ToolStatus> {
  const base = { id: "editly", label: "editly" } as const;
  const packageJsonPath = path.join(repoRoot, "node_modules", "editly", "package.json");
  try {
    const { version } = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
    return { ...base, isAvailable: true, version, detail: null };
  } catch {
    return { ...base, isAvailable: false, version: null, detail: "Paket npm editly belum terpasang" };
  }
}

function formatSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1 ? `${Math.round(megabytes)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function firstLine(stdout: string): string {
  return stdout.split(/\r?\n/)[0]?.trim() ?? "";
}

/** "ffmpeg version 7.1-full_build ..." → "7.1-full_build" */
function versionAfterWord(stdout: string): string {
  const words = firstLine(stdout).split(/\s+/);
  const index = words.indexOf("version");
  return index >= 0 ? (words[index + 1] ?? "") : firstLine(stdout);
}
