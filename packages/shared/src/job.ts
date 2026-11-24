import { z } from "zod";
import { CLIP_LIMITS, DEFAULT_JOB_SETTINGS } from "./defaults.ts";

export const ANALYSIS_STAGE_IDS = [
  "download",
  "extract-audio",
  "separate-vocals",
  "denoise",
  "transcribe",
  "find-moments",
] as const;
export type AnalysisStageId = (typeof ANALYSIS_STAGE_IDS)[number];

export const CLIP_STAGE_IDS = ["track-faces", "reframe", "render"] as const;
export type ClipStageId = (typeof CLIP_STAGE_IDS)[number];

export type StageId = AnalysisStageId | ClipStageId;

export const STAGE_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
  "cancelled",
] as const;
export const stageStatusSchema = z.enum(STAGE_STATUSES);
export type StageStatus = z.infer<typeof stageStatusSchema>;

export const JOB_STATUSES = ["queued", "analyzing", "ready", "failed", "cancelled"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const stageStateSchema = z.object({
  status: stageStatusSchema,
  /** 0..1 */
  progress: z.number().min(0).max(1),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  message: z.string().nullable(),
});
export type StageState = z.infer<typeof stageStateSchema>;

export const jobSettingsSchema = z
  .object({
    language: z.enum(["id", "en", "auto"]).default(DEFAULT_JOB_SETTINGS.language),
    minClipSec: z
      .number()
      .min(CLIP_LIMITS.minClipSec)
      .max(CLIP_LIMITS.maxClipSec)
      .default(DEFAULT_JOB_SETTINGS.minClipSec),
    maxClipSec: z
      .number()
      .min(CLIP_LIMITS.minClipSec)
      .max(CLIP_LIMITS.maxClipSec)
      .default(DEFAULT_JOB_SETTINGS.maxClipSec),
    targetClipSec: z
      .number()
      .min(CLIP_LIMITS.minClipSec)
      .max(CLIP_LIMITS.maxClipSec)
      .default(DEFAULT_JOB_SETTINGS.targetClipSec),
    maxCandidates: z
      .number()
      .int()
      .min(1)
      .max(CLIP_LIMITS.maxCandidates)
      .default(DEFAULT_JOB_SETTINGS.maxCandidates),
    separateVocals: z.boolean().default(DEFAULT_JOB_SETTINGS.separateVocals),
    denoise: z.boolean().default(DEFAULT_JOB_SETTINGS.denoise),
    onlineTranscribe: z.boolean().default(DEFAULT_JOB_SETTINGS.onlineTranscribe),
    musicVolume: z.number().min(0).max(1).default(DEFAULT_JOB_SETTINGS.musicVolume),
    subtitleStyle: z
      .enum(["bold-center", "lower-third"])
      .default(DEFAULT_JOB_SETTINGS.subtitleStyle),
  })
  .refine((settings) => settings.minClipSec <= settings.maxClipSec, {
    message: "minClipSec must be <= maxClipSec",
    path: ["minClipSec"],
  })
  .refine(
    (settings) =>
      settings.targetClipSec >= settings.minClipSec &&
      settings.targetClipSec <= settings.maxClipSec,
    { message: "targetClipSec must be between min and max", path: ["targetClipSec"] },
  );
export type JobSettings = z.infer<typeof jobSettingsSchema>;

/**
 * Optional analysis stages and the setting that turns each one on. Clean studio podcasts
 * gain nothing from them, and Demucs alone takes about the audio's own length on a CPU.
 */
export const SKIPPABLE_STAGES = {
  "separate-vocals": "separateVocals",
  denoise: "denoise",
} as const satisfies Partial<Record<AnalysisStageId, keyof JobSettings>>;
export type SkippableStageId = keyof typeof SKIPPABLE_STAGES;

export function isSkippableStage(id: string): id is SkippableStageId {
  return Object.hasOwn(SKIPPABLE_STAGES, id);
}

export const jobSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("url"), url: z.string().url() }),
  z.object({ kind: z.literal("file"), originalName: z.string() }),
]);
export type JobSource = z.infer<typeof jobSourceSchema>;

/** Paths are relative to the job folder. */
export const jobArtifactsSchema = z.object({
  sourceVideo: z.string().optional(),
  sourceInfo: z.string().optional(),
  audioFull: z.string().optional(),
  vocals: z.string().optional(),
  noVocals: z.string().optional(),
  vocalsClean: z.string().optional(),
  audio16k: z.string().optional(),
  energy: z.string().optional(),
  transcript: z.string().optional(),
  candidates: z.string().optional(),
});
export type JobArtifacts = z.infer<typeof jobArtifactsSchema>;

export const captionSchema = z.object({
  /** Relative to the clip start. */
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string(),
});
export type Caption = z.infer<typeof captionSchema>;

export const clipStagesSchema = z.object({
  "track-faces": stageStateSchema,
  reframe: stageStateSchema,
  render: stageStateSchema,
});

export const clipSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  createdAt: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  captions: z.array(captionSchema),
  stages: clipStagesSchema,
  /** Path of final.mp4 relative to the job folder, once rendered. */
  output: z.string().nullable(),
  error: z.object({ code: z.string(), userMessage: z.string() }).nullable(),
  /** Set when the user asks for a render; cleared when the clip is edited. */
  renderRequestedAt: z.string().nullable().default(null),
});
export type Clip = z.infer<typeof clipSchema>;

export const CLIP_STATUSES = [
  "draft",
  "queued",
  "rendering",
  "done",
  "failed",
  "cancelled",
] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

/** Single status for a clip, derived from its stages (never stored, so it cannot drift). */
export function clipStatus(clip: Clip): ClipStatus {
  const states = CLIP_STAGE_IDS.map((id) => clip.stages[id].status);
  if (states.includes("running")) return "rendering";
  if (clip.error) return "failed";
  if (clip.output) return "done";
  if (states.includes("cancelled")) return "cancelled";
  if (clip.renderRequestedAt) return "queued";
  return "draft";
}

/** Overall render progress 0..1 across the clip stages. */
export function clipProgress(clip: Clip): number {
  const total = CLIP_STAGE_IDS.reduce((sum, id) => {
    const state = clip.stages[id];
    return sum + (state.status === "done" ? 1 : state.progress);
  }, 0);
  return total / CLIP_STAGE_IDS.length;
}

export const jobErrorSchema = z.object({ code: z.string(), userMessage: z.string() });
export type JobError = z.infer<typeof jobErrorSchema>;

export const jobSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: jobSourceSchema,
  title: z.string().nullable(),
  durationSec: z.number().nullable(),
  status: jobStatusSchema,
  stages: z.object({
    download: stageStateSchema,
    "extract-audio": stageStateSchema,
    "separate-vocals": stageStateSchema,
    denoise: stageStateSchema,
    transcribe: stageStateSchema,
    "find-moments": stageStateSchema,
  }),
  settings: jobSettingsSchema,
  artifacts: jobArtifactsSchema,
  clips: z.array(clipSchema),
  error: jobErrorSchema.nullable(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobSummarySchema = jobSchema.pick({
  id: true,
  createdAt: true,
  source: true,
  title: true,
  durationSec: true,
  status: true,
  error: true,
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export function createStageState(): StageState {
  return { status: "pending", progress: 0, startedAt: null, finishedAt: null, message: null };
}

/** Overall analysis progress 0..1 (each stage weighted equally). */
export function analysisProgress(job: Job): number {
  const states = ANALYSIS_STAGE_IDS.map((id) => job.stages[id]);
  const total = states.reduce(
    (sum, state) =>
      sum + (state.status === "done" || state.status === "skipped" ? 1 : state.progress),
    0,
  );
  return total / states.length;
}
