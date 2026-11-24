import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import {
  CLIP_LIMITS,
  CLIP_STAGE_IDS,
  candidatesFileSchema,
  createStageState,
  transcriptSchema,
  type Clip,
  type CreateClipBody,
  type Job,
  type UpdateClipBody,
} from "@clipper/shared";
import { AppError } from "../lib/errors.ts";
import { buildCaptions, wordsInRange } from "../pipeline/captions/build-captions.ts";
import type { SettingsStore } from "../settings/settings-store.ts";
import type { JobQueue } from "./job-queue.ts";
import type { JobService } from "./job-service.ts";
import type { JobStore } from "./job-store.ts";

function newClipStages(): Clip["stages"] {
  return {
    "track-faces": createStageState(),
    reframe: createStageState(),
    render: createStageState(),
  };
}

function invalid(message: string, userMessage: string, statusCode = 400): AppError {
  return new AppError({ code: "CLIP_INVALID", message, userMessage, statusCode });
}

function isRendering(clip: Clip): boolean {
  return CLIP_STAGE_IDS.some((id) => clip.stages[id].status === "running");
}

/** Use cases for clips inside a job: create from a candidate, edit, render, delete. */
export class ClipService {
  readonly #store: JobStore;
  readonly #queue: JobQueue;
  readonly #jobs: JobService;
  readonly #settings: SettingsStore;

  constructor(store: JobStore, queue: JobQueue, jobs: JobService, settings: SettingsStore) {
    this.#store = store;
    this.#queue = queue;
    this.#jobs = jobs;
    this.#settings = settings;
  }

  async create(jobId: string, body: CreateClipBody): Promise<Clip> {
    const job = this.#store.get(jobId);
    if (job.status !== "ready") {
      throw invalid(`Job ${jobId} is ${job.status}`, "Tunggu sampai analisis job selesai.", 409);
    }
    const { candidates } = await this.#jobs.readArtifact(jobId, "candidates", candidatesFileSchema);
    const candidate = candidates.find((item) => item.id === body.candidateId);
    if (!candidate) {
      throw invalid(`Unknown candidate ${body.candidateId}`, "Kandidat klip tidak ditemukan.", 404);
    }
    const startSec = body.startSec ?? candidate.startSec;
    const endSec = body.endSec ?? candidate.endSec;
    this.#validateRange(job, startSec, endSec);

    const clip: Clip = {
      id: randomUUID(),
      candidateId: candidate.id,
      createdAt: new Date().toISOString(),
      startSec,
      endSec,
      captions: await this.#captionsFor(jobId, startSec, endSec),
      stages: newClipStages(),
      output: null,
      error: null,
      renderRequestedAt: null,
      captionStyle: this.#settings.get().defaultCaptionStyle,
    };
    await this.#store.update(jobId, (draft) => {
      draft.clips.push(clip);
    });
    return clip;
  }

  /**
   * Range change → captions rebuilt from the transcript (unless given) and every stage reset.
   * Captions-only change → only the render stage is reset.
   */
  async update(jobId: string, clipId: string, body: UpdateClipBody): Promise<Clip> {
    const job = this.#store.get(jobId);
    const clip = this.#find(job, clipId);
    if (isRendering(clip)) {
      throw invalid(
        `Clip ${clipId} is rendering`,
        "Klip sedang dirender. Tunggu atau batalkan dulu.",
        409,
      );
    }
    const startSec = body.startSec ?? clip.startSec;
    const endSec = body.endSec ?? clip.endSec;
    const isRangeChanged = startSec !== clip.startSec || endSec !== clip.endSec;
    if (isRangeChanged) this.#validateRange(job, startSec, endSec);
    const captions =
      body.captions ?? (isRangeChanged ? await this.#captionsFor(jobId, startSec, endSec) : null);
    const isStyleChanged = body.captionStyle !== undefined;

    const updated = await this.#store.update(jobId, (draft) => {
      const target = this.#find(draft, clipId);
      target.startSec = startSec;
      target.endSec = endSec;
      if (captions) target.captions = captions;
      if (body.captionStyle !== undefined) target.captionStyle = body.captionStyle;
      if (isRangeChanged) target.stages = newClipStages();
      else if (captions || isStyleChanged) target.stages.render = createStageState();
      if (isRangeChanged || captions || isStyleChanged) {
        target.output = null;
        target.error = null;
        target.renderRequestedAt = null;
      }
    });
    return this.#find(updated, clipId);
  }

  async render(jobId: string, clipId: string): Promise<Clip> {
    const updated = await this.#store.update(jobId, (draft) => {
      const clip = this.#find(draft, clipId);
      for (const id of CLIP_STAGE_IDS) {
        const state = clip.stages[id];
        if (state.status === "failed" || state.status === "cancelled") {
          clip.stages[id] = createStageState();
        }
      }
      clip.error = null;
      clip.renderRequestedAt = new Date().toISOString();
    });
    this.#queue.enqueue({ kind: "render", jobId, clipId });
    return this.#find(updated, clipId);
  }

  async cancel(jobId: string, clipId: string): Promise<void> {
    this.#find(this.#store.get(jobId), clipId);
    this.#queue.cancelJob(jobId, clipId);
    await this.#queue.idleFor(jobId);
  }

  async delete(jobId: string, clipId: string): Promise<void> {
    this.#find(this.#store.get(jobId), clipId);
    this.#queue.cancelJob(jobId, clipId);
    await this.#queue.idleFor(jobId);
    await rm(path.join(this.#store.jobDir(jobId), "clips", clipId), {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    await this.#store.update(jobId, (draft) => {
      draft.clips = draft.clips.filter((item) => item.id !== clipId);
    });
  }

  /** Folder of an existing clip (validated, so the path is always inside the workspace). */
  clipDir(jobId: string, clipId: string): string {
    this.#find(this.#store.get(jobId), clipId);
    return path.join(this.#store.jobDir(jobId), "clips", clipId);
  }

  #find(job: Job, clipId: string): Clip {
    const clip = job.clips.find((item) => item.id === clipId);
    if (!clip) throw invalid(`Clip not found: ${clipId}`, "Klip tidak ditemukan.", 404);
    return clip;
  }

  #validateRange(job: Job, startSec: number, endSec: number): void {
    const duration = endSec - startSec;
    const limit = job.durationSec ?? Infinity;
    if (startSec < 0 || endSec > limit + 0.5 || duration <= 0) {
      throw invalid(`Invalid range ${startSec}-${endSec}`, "Rentang waktu klip tidak valid.");
    }
    if (duration < CLIP_LIMITS.minClipSec || duration > CLIP_LIMITS.maxClipSec) {
      throw invalid(
        `Clip length ${duration}s outside limits`,
        `Durasi klip harus ${CLIP_LIMITS.minClipSec}–${CLIP_LIMITS.maxClipSec} detik.`,
      );
    }
  }

  async #captionsFor(jobId: string, startSec: number, endSec: number): Promise<Clip["captions"]> {
    const transcript = await this.#jobs.readArtifact(jobId, "transcript", transcriptSchema);
    return buildCaptions(wordsInRange(transcript, startSec, endSec), startSec);
  }
}
