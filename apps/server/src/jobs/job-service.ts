import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  ANALYSIS_STAGE_IDS,
  SKIPPABLE_STAGES,
  createStageState,
  isSkippableStage,
  jobSettingsSchema,
  type Job,
  type JobArtifacts,
  type JobSettingsInput,
  type JobSource,
  type JobSummary,
} from "@clipper/shared";
import type { z } from "zod";
import { parseInput } from "../http/validate.ts";
import { AppError } from "../lib/errors.ts";
import { readJson, resolveInside, sanitizeFileName } from "../lib/fs-utils.ts";
import type { JobQueue } from "./job-queue.ts";
import type { JobStore } from "./job-store.ts";

const ALLOWED_UPLOAD_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".m4v", ".webm"]);

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

  /**
   * Creates a job from an uploaded file stream. The file is streamed straight to disk
   * (never buffered in memory); the job is removed again if the upload fails.
   */
  async createFromUpload(options: {
    originalName: string;
    settingsInput: JobSettingsInput | undefined;
    stream: Readable & { truncated?: boolean };
  }): Promise<Job> {
    const extension = path.extname(options.originalName).toLowerCase();
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
      options.stream.resume(); // drain so the request can finish
      throw new AppError({
        code: "UPLOAD_TYPE_NOT_ALLOWED",
        message: `Upload extension not allowed: ${extension}`,
        userMessage: "Format file tidak didukung. Gunakan MP4, MKV, MOV, M4V, atau WEBM.",
        statusCode: 415,
      });
    }
    const job = await this.create(
      { kind: "file", originalName: sanitizeFileName(options.originalName) },
      options.settingsInput,
    );
    const sourceDir = path.join(this.#store.jobDir(job.id), "source");
    const destination = path.join(sourceDir, `upload${extension}`);
    try {
      await mkdir(sourceDir, { recursive: true });
      await pipeline(options.stream, createWriteStream(destination));
      if (options.stream.truncated) {
        throw new AppError({
          code: "UPLOAD_TOO_LARGE",
          message: "Upload exceeded the size limit",
          userMessage: "File terlalu besar. Naikkan MAX_UPLOAD_MB di .env bila perlu.",
          statusCode: 413,
        });
      }
    } catch (error) {
      await this.#store.delete(job.id);
      throw error;
    }
    return this.#store.update(job.id, (draft) => {
      draft.artifacts.sourceVideo = `source/upload${extension}`;
    });
  }

  /** Reads a JSON artifact (transcript, candidates…) of a job, 404 if the stage has not run. */
  async readArtifact<T extends z.ZodTypeAny>(
    jobId: string,
    key: keyof JobArtifacts,
    schema: T,
  ): Promise<z.infer<T>> {
    const job = this.#store.get(jobId);
    const relative = job.artifacts[key];
    if (!relative) {
      throw new AppError({
        code: "ARTIFACT_NOT_READY",
        message: `Artifact ${key} not available for job ${jobId}`,
        userMessage: "Data ini belum tersedia. Tunggu sampai tahapnya selesai.",
        statusCode: 404,
      });
    }
    return readJson(resolveInside(this.#store.jobDir(jobId), relative), schema);
  }

  start(jobId: string): void {
    this.#queue.enqueue({ kind: "analyze", jobId });
  }

  async cancel(jobId: string): Promise<Job> {
    this.#store.get(jobId);
    const result = this.#queue.cancelJob(jobId);
    if (!result.removedQueued && !result.abortedRunning) {
      throw conflict(`Job ${jobId} is not running`, "Tidak ada proses yang sedang berjalan.");
    }
    // A task removed before it started never reaches the pipeline's cancel branch.
    if (!result.abortedRunning) {
      return this.#store.update(jobId, (draft) => {
        draft.status = "cancelled";
      });
    }
    await this.#queue.idleFor(jobId);
    return this.#store.get(jobId);
  }

  /**
   * Turns an optional stage off for this job. A pending stage is skipped when the pipeline
   * reaches it; a running one is stopped and the pipeline continues right after it.
   */
  async skipStage(jobId: string, stageId: string): Promise<Job> {
    if (!isSkippableStage(stageId)) {
      throw new AppError({
        code: "STAGE_NOT_SKIPPABLE",
        message: `Stage ${stageId} cannot be skipped`,
        userMessage: "Tahap ini wajib dan tidak bisa dilewati.",
        statusCode: 400,
      });
    }
    const state = this.#store.get(jobId).stages[stageId];
    if (state.status === "done" || state.status === "skipped") {
      throw conflict(`Stage ${stageId} already finished`, "Tahap ini sudah selesai.");
    }
    await this.#store.update(jobId, (draft) => {
      draft.settings[SKIPPABLE_STAGES[stageId]] = false;
    });
    if (state.status !== "running") return this.#store.get(jobId);

    this.#queue.cancelJob(jobId);
    await this.#queue.idleFor(jobId);
    const updated = await this.#store.update(jobId, (draft) => {
      draft.stages[stageId] = createStageState();
      draft.status = "queued";
      draft.error = null;
    });
    this.start(jobId);
    return updated;
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
