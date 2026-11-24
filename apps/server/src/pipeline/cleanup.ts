import { rm } from "node:fs/promises";
import type { Job, JobArtifacts } from "@clipper/shared";
import { resolveInside } from "../lib/fs-utils.ts";

/**
 * Intermediate audio that no clip stage reads once analysis is done. Together they take
 * roughly 1 GB per hour of podcast, so they are removed when the job becomes ready.
 * Kept: vocals_clean (clip speech), no_vocals (optional music), the source video.
 */
export function disposableArtifacts(job: Job): (keyof JobArtifacts)[] {
  const keys: (keyof JobArtifacts)[] = ["audioFull", "audio16k"];
  // Without a denoised track, clips read the separated vocals, so they must stay.
  if (job.artifacts.vocalsClean) keys.push("vocals");
  return keys.filter((key) => job.artifacts[key] !== undefined);
}

export async function removeIntermediateAudio(
  jobDir: string,
  job: Job,
): Promise<(keyof JobArtifacts)[]> {
  const keys = disposableArtifacts(job);
  for (const key of keys) {
    const relative = job.artifacts[key];
    if (relative) await rm(resolveInside(jobDir, relative), { force: true });
  }
  return keys;
}
