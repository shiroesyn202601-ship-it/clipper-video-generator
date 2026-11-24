import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Clip, Job, StageState } from "@clipper/shared";
import type { Config } from "../config.ts";
import type { QueueTask } from "../jobs/job-queue.ts";
import type { JobStore } from "../jobs/job-store.ts";
import { AppError, errorMessage } from "../lib/errors.ts";
import type { AnalysisStage, ClipStage, ClipStageContext, StageContext } from "./stage.ts";

type Logger = {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export type PipelineDeps = {
  config: Config;
  store: JobStore;
  logger: Logger;
  analysisStages: readonly AnalysisStage[];
  clipStages: readonly ClipStage[];
};

const CANCELLED_MESSAGE = "Proses dibatalkan.";

function now(): string {
  return new Date().toISOString();
}

function toFailure(error: unknown): { code: string; userMessage: string } {
  if (error instanceof AppError) return { code: error.code, userMessage: error.userMessage };
  return { code: "UNEXPECTED", userMessage: "Terjadi kesalahan yang tidak terduga. Lihat log." };
}

function markRunning(state: StageState): void {
  state.status = "running";
  state.progress = 0;
  state.startedAt = now();
  state.finishedAt = null;
  state.message = null;
}

function markFinished(state: StageState, status: StageState["status"], message: string | null) {
  state.status = status;
  if (status === "done") state.progress = 1;
  state.finishedAt = now();
  state.message = message;
}

async function logStageError(logFile: string, error: unknown): Promise<void> {
  await mkdir(path.dirname(logFile), { recursive: true });
  const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
  await appendFile(logFile, `\n[error] ${stack}\n`, "utf8");
}

/** Creates the function the queue calls for each task. */
export function createPipelineRunner(deps: PipelineDeps) {
  const { config, store, logger } = deps;

  function baseContext(job: Job, stageId: string, signal: AbortSignal): StageContext {
    const jobDir = store.jobDir(job.id);
    return {
      config,
      job: () => store.get(job.id),
      jobDir,
      signal,
      logFile: path.join(jobDir, "logs", `${stageId}.log`),
      reportProgress: () => undefined,
      setArtifacts: async (patch) => {
        await store.update(job.id, (draft) => {
          Object.assign(draft.artifacts, patch);
        });
      },
      updateJob: async (mutate) => {
        await store.update(job.id, mutate);
      },
    };
  }

  async function runAnalysis(jobId: string, signal: AbortSignal): Promise<void> {
    await store.update(jobId, (draft) => {
      draft.status = "analyzing";
      draft.error = null;
    });

    for (const stage of deps.analysisStages) {
      const job = store.get(jobId);
      const state = job.stages[stage.id];
      if (state.status === "done" || state.status === "skipped") continue;

      if (stage.shouldSkip?.(job)) {
        await store.update(jobId, (draft) => markFinished(draft.stages[stage.id], "skipped", null));
        continue;
      }

      await store.update(jobId, (draft) => markRunning(draft.stages[stage.id]));
      const context: StageContext = {
        ...baseContext(job, stage.id, signal),
        reportProgress: (fraction, message) => {
          void store.update(
            jobId,
            (draft) => {
              const current = draft.stages[stage.id];
              current.progress = Math.max(0, Math.min(1, fraction));
              if (message !== undefined) current.message = message;
            },
            { isProgressOnly: true },
          );
        },
      };

      try {
        logger.info({ jobId, stage: stage.id }, "stage started");
        // An abort that happened before the stage subscribed to the signal must still stop it.
        signal.throwIfAborted();
        await stage.run(context);
        await store.update(jobId, (draft) => markFinished(draft.stages[stage.id], "done", null));
        logger.info({ jobId, stage: stage.id }, "stage done");
      } catch (error) {
        await logStageError(context.logFile, error);
        if (signal.aborted) {
          await store.update(jobId, (draft) => {
            markFinished(draft.stages[stage.id], "cancelled", CANCELLED_MESSAGE);
            draft.status = "cancelled";
          });
          return;
        }
        const failure = toFailure(error);
        logger.error({ jobId, stage: stage.id, err: errorMessage(error) }, "stage failed");
        await store.update(jobId, (draft) => {
          markFinished(draft.stages[stage.id], "failed", failure.userMessage);
          draft.status = "failed";
          draft.error = failure;
        });
        return;
      }
    }

    await store.update(jobId, (draft) => {
      draft.status = "ready";
    });
  }

  async function runClip(jobId: string, clipId: string, signal: AbortSignal): Promise<void> {
    const findClip = (job: Job): Clip => {
      const clip = job.clips.find((item) => item.id === clipId);
      if (!clip) {
        throw new AppError({
          code: "CLIP_NOT_FOUND",
          message: `Clip not found: ${clipId}`,
          userMessage: "Klip tidak ditemukan.",
          statusCode: 404,
        });
      }
      return clip;
    };
    const updateClip = async (mutate: (draft: Clip) => void): Promise<void> => {
      await store.update(jobId, (draft) => mutate(findClip(draft)));
    };

    await updateClip((clip) => {
      clip.error = null;
    });

    for (const stage of deps.clipStages) {
      const job = store.get(jobId);
      const clip = findClip(job);
      if (clip.stages[stage.id].status === "done") continue;

      await updateClip((draft) => markRunning(draft.stages[stage.id]));
      const context: ClipStageContext = {
        ...baseContext(job, `${stage.id}-${clipId}`, signal),
        clip: () => findClip(store.get(jobId)),
        clipDir: path.join(store.jobDir(jobId), "clips", clipId),
        updateClip,
        reportProgress: (fraction, message) => {
          void store.update(
            jobId,
            (draft) => {
              const current = findClip(draft).stages[stage.id];
              current.progress = Math.max(0, Math.min(1, fraction));
              if (message !== undefined) current.message = message;
            },
            { isProgressOnly: true },
          );
        },
      };

      try {
        // An abort that happened before the stage subscribed to the signal must still stop it.
        signal.throwIfAborted();
        await stage.run(context);
        await updateClip((draft) => markFinished(draft.stages[stage.id], "done", null));
      } catch (error) {
        await logStageError(context.logFile, error);
        if (signal.aborted) {
          await updateClip((draft) =>
            markFinished(draft.stages[stage.id], "cancelled", CANCELLED_MESSAGE),
          );
          return;
        }
        const failure = toFailure(error);
        logger.error({ jobId, clipId, stage: stage.id, err: errorMessage(error) }, "clip failed");
        await updateClip((draft) => {
          markFinished(draft.stages[stage.id], "failed", failure.userMessage);
          draft.error = failure;
        });
        return;
      }
    }
  }

  return async function runTask(task: QueueTask, signal: AbortSignal): Promise<void> {
    if (task.kind === "analyze") await runAnalysis(task.jobId, signal);
    else await runClip(task.jobId, task.clipId, signal);
  };
}
