import { z } from "zod";

export const clipCandidateSchema = z.object({
  id: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string(),
  /** 0..100 */
  score: z.number().min(0).max(100),
  /** Human-readable (Indonesian) reasons for the score. */
  reasons: z.array(z.string()),
  /** Raw normalized feature values 0..1, for debugging and tuning. */
  features: z.record(z.string(), z.number()),
});
export type ClipCandidate = z.infer<typeof clipCandidateSchema>;

export const candidatesFileSchema = z.object({
  candidates: z.array(clipCandidateSchema),
});
export type CandidatesFile = z.infer<typeof candidatesFileSchema>;

/** Audio energy sampled at a fixed step, produced by the audio_energy worker. */
export const energyFileSchema = z.object({
  stepSec: z.number().positive(),
  /** RMS in dBFS per step. */
  rmsDb: z.array(z.number()),
});
export type EnergyFile = z.infer<typeof energyFileSchema>;

/** Face tracking result for one clip, produced by the track_faces worker. */
export const facesFileSchema = z.object({
  fps: z.number().positive(),
  sourceWidth: z.number().int().positive(),
  sourceHeight: z.number().int().positive(),
  crop: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  /** Crop center x (source pixels) over clip-relative time. */
  keyframes: z.array(z.object({ timeSec: z.number(), centerX: z.number() })),
  hasFaces: z.boolean(),
});
export type FacesFile = z.infer<typeof facesFileSchema>;
