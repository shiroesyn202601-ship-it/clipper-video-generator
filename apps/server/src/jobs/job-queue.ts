export type QueueTask =
  { kind: "analyze"; jobId: string } | { kind: "render"; jobId: string; clipId: string };

type RunTask = (task: QueueTask, signal: AbortSignal) => Promise<void>;
type Logger = { error: (obj: object, msg: string) => void };

function sameTask(a: QueueTask, b: QueueTask): boolean {
  if (a.kind !== b.kind || a.jobId !== b.jobId) return false;
  return a.kind === "analyze" || (b.kind === "render" && a.clipId === b.clipId);
}

/**
 * Runs heavy tasks one at a time (CPU/GPU bound tools must not compete).
 * Each running task gets an AbortSignal so it can be cancelled.
 */
export class JobQueue {
  readonly #runTask: RunTask;
  readonly #logger: Logger;
  readonly #pending: QueueTask[] = [];
  #running: { task: QueueTask; controller: AbortController } | null = null;

  constructor(runTask: RunTask, logger: Logger) {
    this.#runTask = runTask;
    this.#logger = logger;
  }

  enqueue(task: QueueTask): void {
    const isDuplicate =
      this.#pending.some((queued) => sameTask(queued, task)) ||
      (this.#running !== null && sameTask(this.#running.task, task));
    if (isDuplicate) return;
    this.#pending.push(task);
    void this.#next();
  }

  /** Removes queued tasks of the job and aborts its running task. Returns true if anything stopped. */
  cancelJob(jobId: string, clipId?: string): boolean {
    const matches = (task: QueueTask): boolean =>
      task.jobId === jobId &&
      (clipId === undefined || (task.kind === "render" && task.clipId === clipId));
    let didCancel = false;
    for (let index = this.#pending.length - 1; index >= 0; index--) {
      const task = this.#pending[index];
      if (task && matches(task)) {
        this.#pending.splice(index, 1);
        didCancel = true;
      }
    }
    if (this.#running && matches(this.#running.task)) {
      this.#running.controller.abort();
      didCancel = true;
    }
    return didCancel;
  }

  isActive(jobId: string): boolean {
    return (
      this.#running?.task.jobId === jobId || this.#pending.some((task) => task.jobId === jobId)
    );
  }

  /** Waits until no task of this job is running (after cancelJob, before deleting files). */
  async idleFor(jobId: string): Promise<void> {
    while (this.#running?.task.jobId === jobId) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Waits for the running task to finish (used in tests and shutdown). */
  async idle(): Promise<void> {
    while (this.#running || this.#pending.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  async #next(): Promise<void> {
    if (this.#running) return;
    const task = this.#pending.shift();
    if (!task) return;
    const controller = new AbortController();
    this.#running = { task, controller };
    try {
      await this.#runTask(task, controller.signal);
    } catch (error) {
      // Task runners record their own failures; this is a last-resort guard.
      this.#logger.error({ task, err: error }, "queue task crashed");
    } finally {
      this.#running = null;
      void this.#next();
    }
  }
}
