import type { AnalysisStageId, Clip, ClipStageId, Job, JobArtifacts } from "@clipper/shared";
import type { Config } from "../config.ts";

export type StageContext = {
  config: Config;
  /** Latest job snapshot (state changes while the stage runs). */
  job: () => Job;
  jobDir: string;
  signal: AbortSignal;
  /** Log file for this stage: logs/<stage>.log */
  logFile: string;
  /** fraction 0..1 */
  reportProgress: (fraction: number, message?: string) => void;
  setArtifacts: (patch: Partial<JobArtifacts>) => Promise<void>;
  updateJob: (mutate: (draft: Job) => void) => Promise<void>;
};

export type AnalysisStage = {
  id: AnalysisStageId;
  /** Return true to mark the stage "skipped" instead of running it. */
  shouldSkip?: (job: Job) => boolean;
  run: (context: StageContext) => Promise<void>;
};

export type ClipStageContext = StageContext & {
  clip: () => Clip;
  /** clips/<clipId>/ inside the job folder. */
  clipDir: string;
  updateClip: (mutate: (draft: Clip) => void) => Promise<void>;
};

export type ClipStage = {
  id: ClipStageId;
  run: (context: ClipStageContext) => Promise<void>;
};
