import type { Job, JobArtifacts } from "@clipper/shared";
import { AppError } from "../../lib/errors.ts";

/**
 * Speech before denoising: the separated vocals, or the original mix when separation was
 * skipped (clean studio podcasts).
 */
export function speechSourceKey(job: Job): "vocals" | "audioFull" {
  return job.artifacts.vocals ? "vocals" : "audioFull";
}

/** The artifact that holds the best speech track for transcription and clips. */
export function cleanVocalsKey(job: Job): "vocalsClean" | "vocals" | "audioFull" {
  return job.artifacts.vocalsClean ? "vocalsClean" : speechSourceKey(job);
}

/** Path of the best speech track: denoised, else separated vocals, else the original mix. */
export function cleanVocalsArtifact(job: Job): string {
  return requireArtifact(job, cleanVocalsKey(job));
}

/** Returns the artifact path recorded by an earlier stage, or fails with a clear error. */
export function requireArtifact(job: Job, key: keyof JobArtifacts): string {
  const value = job.artifacts[key];
  if (!value) {
    throw new AppError({
      code: "ARTIFACT_MISSING",
      message: `Missing artifact "${key}" for job ${job.id}`,
      userMessage: "Hasil tahap sebelumnya tidak ditemukan. Coba ulangi job dari awal.",
    });
  }
  return value;
}
