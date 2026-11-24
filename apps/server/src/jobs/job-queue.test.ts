import { describe, expect, it, vi } from "vitest";
import { JobQueue, type QueueTask } from "./job-queue.ts";

const logger = { error: vi.fn() };

describe("JobQueue", () => {
  it("runs tasks one at a time in order", async () => {
    const order: string[] = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const queue = new JobQueue(async (task) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(task.jobId);
      concurrent--;
    }, logger);
    queue.enqueue({ kind: "analyze", jobId: "a" });
    queue.enqueue({ kind: "analyze", jobId: "b" });
    queue.enqueue({ kind: "analyze", jobId: "a" }); // duplicate of the running task: ignored
    await queue.idle();
    expect(order).toEqual(["a", "b"]);
    expect(maxConcurrent).toBe(1);
  });

  it("aborts the running task and drops queued ones on cancel", async () => {
    const seen: QueueTask[] = [];
    let wasAborted = false;
    const queue = new JobQueue(async (task, signal) => {
      seen.push(task);
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => {
          wasAborted = true;
          resolve();
        });
        setTimeout(resolve, 500);
      });
    }, logger);
    queue.enqueue({ kind: "analyze", jobId: "a" });
    queue.enqueue({ kind: "render", jobId: "a", clipId: "c1" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queue.cancelJob("a")).toEqual({ removedQueued: true, abortedRunning: true });
    await queue.idle();
    expect(wasAborted).toBe(true);
    expect(seen).toHaveLength(1);
  });
});
