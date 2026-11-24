import type { Job, JobArtifacts } from "@clipper/shared";
import { AppError } from "../../lib/errors.ts";

/** The best speech track: denoised vocals, or plain separated vocals when denoise was skipped. */
export function cleanVocalsArtifact(job: Job): string {
  return job.artifacts.vocalsClean ?? requireArtifact(job, "vocals");
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
