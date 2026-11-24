import { rm } from "node:fs/promises";
import type { Job, JobArtifacts } from "@clipper/shared";
import { resolveInside } from "../lib/fs-utils.ts";
import { cleanVocalsKey } from "./stages/artifacts.ts";

/**
 * Intermediate audio that no clip stage reads once analysis is done. Together they take
 * roughly 1 GB per hour of podcast, so they are removed when the job becomes ready.
 * Never removed: the speech track clips use (which is audio_full.wav itself when separation
 * was skipped), no_vocals (optional music) and the source video.
 */
export function disposableArtifacts(job: Job): (keyof JobArtifacts)[] {
  const keep = cleanVocalsKey(job);
  const candidates: (keyof JobArtifacts)[] = ["audioFull", "audio16k", "vocals"];
  return candidates.filter((key) => key !== keep && job.artifacts[key] !== undefined);
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
