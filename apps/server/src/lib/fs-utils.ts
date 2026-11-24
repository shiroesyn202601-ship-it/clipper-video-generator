import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { AppError } from "./errors.ts";

/** Writes JSON atomically: temp file + rename, so a crash never leaves half a file. */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  try {
    await renameWithRetry(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/** Windows can briefly lock a file that is being read (antivirus, indexer); retry a few times. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const delaysMs = [20, 60, 150, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = delaysMs[attempt];
      if ((code !== "EPERM" && code !== "EBUSY") || delay === undefined) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export async function readJson<T extends z.ZodTypeAny>(
  filePath: string,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await readFile(filePath, "utf8");
  return schema.parse(JSON.parse(raw)) as z.infer<T>;
}

/**
 * Resolves `relativePath` inside `root` and rejects anything that escapes it
 * (path traversal like "../../etc/passwd" or absolute paths).
 */
export function resolveInside(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError({
      code: "PATH_OUTSIDE_WORKSPACE",
      message: `Path escapes root: ${relativePath}`,
      userMessage: "Lokasi file tidak valid.",
      statusCode: 400,
    });
  }
  return resolved;
}

/** Converts an absolute path inside the job folder to the portable relative form stored in job.json. */
export function toJobRelative(jobDir: string, absolutePath: string): string {
  return path.relative(jobDir, absolutePath).split(path.sep).join("/");
}

/** Makes a user-supplied file name safe for the local filesystem. */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name).normalize("NFKC");
  const cleaned = base
    .replace(/[<>:"/\\|?*]/g, "_")
    .split("")
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .replace(/^[.\-\s]+/, "")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "video";
}
