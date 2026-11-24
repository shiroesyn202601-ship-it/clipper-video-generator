import { z } from "zod";
import { captionSchema, jobSchema } from "./job.ts";

/** Settings sent by the client: every field optional, server applies defaults. */
export const jobSettingsInputSchema = z
  .object({
    language: z.enum(["id", "en", "auto"]),
    minClipSec: z.number(),
    maxClipSec: z.number(),
    targetClipSec: z.number(),
    maxCandidates: z.number().int(),
    separateVocals: z.boolean(),
    denoise: z.boolean(),
    musicVolume: z.number(),
    subtitleStyle: z.enum(["bold-center", "lower-third"]),
  })
  .partial();
export type JobSettingsInput = z.infer<typeof jobSettingsInputSchema>;

export const createJobBodySchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "URL must start with http:// or https://"),
  settings: jobSettingsInputSchema.optional(),
});
export type CreateJobBody = z.infer<typeof createJobBodySchema>;

export const createClipBodySchema = z.object({
  candidateId: z.string().min(1),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().nonnegative().optional(),
});
export type CreateClipBody = z.infer<typeof createClipBodySchema>;

export const updateClipBodySchema = z
  .object({
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    captions: z.array(captionSchema).max(500),
  })
  .partial();
export type UpdateClipBody = z.infer<typeof updateClipBodySchema>;

/** Server-sent events on GET /api/jobs/:id/events */
export const jobEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job-update"), job: jobSchema }),
  z.object({ type: z.literal("job-deleted"), jobId: z.string() }),
]);
export type JobEvent = z.infer<typeof jobEventSchema>;
