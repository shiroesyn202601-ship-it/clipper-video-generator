import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { jobSchema, type Job, type JobEvent } from "@clipper/shared";
import { AppError, errorMessage } from "../lib/errors.ts";
import { readJson, writeJsonAtomic } from "../lib/fs-utils.ts";

/** Progress-only updates are coalesced: disk + SSE at most this often per job (ms). */
const PROGRESS_FLUSH_MS = 300;
const JOB_FILE = "job.json";

type Listener = (event: JobEvent) => void;
type Logger = { warn: (obj: object, msg: string) => void };

export type UpdateOptions = {
  /** Frequent progress ticks: coalesce instead of writing immediately. */
  isProgressOnly?: boolean;
};

/**
 * Owns all job state. Single source of truth in memory, persisted to workspace/<id>/job.json.
 * Writes per job are serialized so renames never race.
 */
export class JobStore {
  readonly #workspaceDir: string;
  readonly #logger: Logger;
  readonly #jobs = new Map<string, Job>();
  readonly #listeners = new Map<string, Set<Listener>>();
  readonly #writeChains = new Map<string, Promise<void>>();
  readonly #pendingFlush = new Map<string, NodeJS.Timeout>();

  constructor(workspaceDir: string, logger: Logger) {
    this.#workspaceDir = workspaceDir;
    this.#logger = logger;
  }

  jobDir(jobId: string): string {
    return path.join(this.#workspaceDir, jobId);
  }

  /** Loads every valid job.json from the workspace. Broken files are skipped with a warning. */
  async load(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(this.#workspaceDir);
    } catch {
      return; // workspace does not exist yet
    }
    for (const entry of entries) {
      const file = path.join(this.#workspaceDir, entry, JOB_FILE);
      try {
        const job = await readJson(file, jobSchema);
        this.#jobs.set(job.id, job);
      } catch (error) {
        // ENOTDIR: workspace/settings.json and other files next to the job folders.
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        this.#logger.warn({ file, error: errorMessage(error) }, "skipping unreadable job file");
      }
    }
  }

  list(): Job[] {
    return [...this.#jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(jobId: string): Job {
    const job = this.#jobs.get(jobId);
    if (!job) {
      throw new AppError({
        code: "JOB_NOT_FOUND",
        message: `Job not found: ${jobId}`,
        userMessage: "Job tidak ditemukan.",
        statusCode: 404,
      });
    }
    return job;
  }

  async create(job: Job): Promise<void> {
    this.#jobs.set(job.id, job);
    await this.#persist(job.id);
    this.#emit(job.id, { type: "job-update", job });
  }

  /** Applies `mutate` to a copy of the job, then persists and notifies listeners. */
  async update(
    jobId: string,
    mutate: (draft: Job) => void,
    options: UpdateOptions = {},
  ): Promise<Job> {
    const draft = structuredClone(this.get(jobId));
    mutate(draft);
    this.#jobs.set(jobId, draft);

    if (options.isProgressOnly) {
      if (!this.#pendingFlush.has(jobId)) {
        const timer = setTimeout(() => void this.#flush(jobId), PROGRESS_FLUSH_MS);
        this.#pendingFlush.set(jobId, timer);
      }
      return draft;
    }
    await this.#flush(jobId);
    return draft;
  }

  async delete(jobId: string): Promise<void> {
    this.get(jobId);
    const timer = this.#pendingFlush.get(jobId);
    if (timer) clearTimeout(timer);
    this.#pendingFlush.delete(jobId);
    this.#jobs.delete(jobId);
    await (this.#writeChains.get(jobId) ?? Promise.resolve());
    await rm(this.jobDir(jobId), { recursive: true, force: true, maxRetries: 3 });
    this.#emit(jobId, { type: "job-deleted", jobId });
    this.#listeners.delete(jobId);
  }

  subscribe(jobId: string, listener: Listener): () => void {
    let set = this.#listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.#listeners.set(jobId, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  async #flush(jobId: string): Promise<void> {
    const timer = this.#pendingFlush.get(jobId);
    if (timer) clearTimeout(timer);
    this.#pendingFlush.delete(jobId);
    const job = this.#jobs.get(jobId);
    if (!job) return;
    this.#emit(jobId, { type: "job-update", job });
    await this.#persist(jobId);
  }

  #persist(jobId: string): Promise<void> {
    const previous = this.#writeChains.get(jobId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const job = this.#jobs.get(jobId);
      if (!job) return;
      await writeJsonAtomic(path.join(this.jobDir(jobId), JOB_FILE), job);
    });
    const settled = next.catch((error: unknown) => {
      this.#logger.warn({ jobId, error: errorMessage(error) }, "failed to persist job");
    });
    this.#writeChains.set(jobId, settled);
    return settled;
  }

  #emit(jobId: string, event: JobEvent): void {
    for (const listener of this.#listeners.get(jobId) ?? []) listener(event);
  }
}
