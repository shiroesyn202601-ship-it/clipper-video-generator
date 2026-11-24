import { randomUUID } from "node:crypto";
import {
  ANALYSIS_STAGE_IDS,
  createStageState,
  jobSettingsSchema,
  type Job,
  type JobSettingsInput,
  type JobSource,
  type JobSummary,
} from "@clipper/shared";
import { parseInput } from "../http/validate.ts";
import { AppError } from "../lib/errors.ts";
import type { JobQueue } from "./job-queue.ts";
import type { JobStore } from "./job-store.ts";

function newAnalysisStages(): Job["stages"] {
  return Object.fromEntries(
    ANALYSIS_STAGE_IDS.map((id) => [id, createStageState()]),
  ) as Job["stages"];
}

function conflict(message: string, userMessage: string): AppError {
  return new AppError({ code: "INVALID_STATE", message, userMessage, statusCode: 409 });
}

/** Use cases for jobs. Routes stay thin and call into here. */
export class JobService {
  readonly #store: JobStore;
  readonly #queue: JobQueue;

  constructor(store: JobStore, queue: JobQueue) {
    this.#store = store;
    this.#queue = queue;
  }

  list(): JobSummary[] {
    return this.#store
      .list()
      .map(({ id, createdAt, source, title, durationSec, status, error }) => ({
        id,
        createdAt,
        source,
        title,
        durationSec,
        status,
        error,
      }));
  }

  get(jobId: string): Job {
    return this.#store.get(jobId);
  }

  /** Creates the job record; for uploads the caller stores the file before calling start(). */
  async create(source: JobSource, settingsInput: JobSettingsInput | undefined): Promise<Job> {
    const settings = parseInput(jobSettingsSchema, settingsInput ?? {});
    const job: Job = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      source,
      title: source.kind === "file" ? source.originalName : null,
      durationSec: null,
      status: "queued",
      stages: newAnalysisStages(),
      settings,
      artifacts: {},
      clips: [],
      error: null,
    };
    await this.#store.create(job);
    return job;
  }

  start(jobId: string): void {
    this.#queue.enqueue({ kind: "analyze", jobId });
  }

  async cancel(jobId: string): Promise<Job> {
    const job = this.#store.get(jobId);
    const wasActive = this.#queue.cancelJob(jobId);
    if (!wasActive) {
      throw conflict(`Job ${jobId} is not running`, "Tidak ada proses yang sedang berjalan.");
    }
    // A queued (not yet started) job never reaches the pipeline's cancel branch.
    if (job.status === "queued") {
      return this.#store.update(jobId, (draft) => {
        draft.status = "cancelled";
      });
    }
    return this.#store.get(jobId);
  }

  /** Continues from the first stage that did not finish. */
  async retry(jobId: string): Promise<Job> {
    const job = this.#store.get(jobId);
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw conflict(
        `Job ${jobId} cannot be retried in ${job.status}`,
        "Job ini tidak bisa diulang.",
      );
    }
    const updated = await this.#store.update(jobId, (draft) => {
      for (const id of ANALYSIS_STAGE_IDS) {
        const state = draft.stages[id];
        if (state.status !== "done" && state.status !== "skipped") {
          draft.stages[id] = createStageState();
        }
      }
      draft.status = "queued";
      draft.error = null;
    });
    this.start(jobId);
    return updated;
  }

  async delete(jobId: string): Promise<void> {
    this.#queue.cancelJob(jobId);
    await this.#queue.idleFor(jobId);
    await this.#store.delete(jobId);
  }

  /** After a restart: put interrupted work back in the queue. */
  async recover(): Promise<void> {
    for (const job of this.#store.list()) {
      if (job.status === "queued" || job.status === "analyzing") {
        await this.#store.update(job.id, (draft) => {
          for (const id of ANALYSIS_STAGE_IDS) {
            if (draft.stages[id].status === "running") draft.stages[id] = createStageState();
          }
          draft.status = "queued";
        });
        this.start(job.id);
      }
      for (const clip of job.clips) {
        const isInterrupted = Object.values(clip.stages).some(
          (state) => state.status === "running",
        );
        if (isInterrupted) {
          await this.#store.update(job.id, (draft) => {
            const target = draft.clips.find((item) => item.id === clip.id);
            if (!target) return;
            for (const state of Object.values(target.stages)) {
              if (state.status === "running") Object.assign(state, createStageState());
            }
          });
          this.#queue.enqueue({ kind: "render", jobId: job.id, clipId: clip.id });
        }
      }
    }
  }
}
