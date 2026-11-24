import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ANALYSIS_STAGE_IDS, type AnalysisStageId } from "@clipper/shared";
import { describe, expect, it, vi } from "vitest";
import { config } from "../config.ts";
import { JobQueue } from "../jobs/job-queue.ts";
import { JobService } from "../jobs/job-service.ts";
import { JobStore } from "../jobs/job-store.ts";
import { AppError } from "../lib/errors.ts";
import { createPipelineRunner } from "./run-pipeline.ts";
import type { AnalysisStage } from "./stage.ts";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function stages(overrides: Partial<Record<AnalysisStageId, AnalysisStage["run"]>> = {}) {
  return ANALYSIS_STAGE_IDS.map((id): AnalysisStage => ({
    id,
    ...(id === "denoise" ? { shouldSkip: (job) => !job.settings.denoise } : {}),
    run:
      overrides[id] ??
      (async (context) => {
        context.reportProgress(0.5);
        await Promise.resolve();
      }),
  }));
}

async function setup(analysisStages: AnalysisStage[]) {
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "clipper-pipeline-"));
  const store = new JobStore(workspaceDir, logger);
  const runTask = createPipelineRunner({
    config,
    store,
    logger,
    analysisStages,
    clipStages: [],
  });
  const queue = new JobQueue(runTask, logger);
  const service = new JobService(store, queue);
  return { workspaceDir, store, queue, service };
}

const urlSource = { kind: "url", url: "https://example.com/watch?v=1" } as const;

describe("pipeline runner", () => {
  it("runs every stage and marks the job ready", async () => {
    const { store, queue, service, workspaceDir } = await setup(stages());
    const job = await service.create(urlSource, { denoise: false });
    service.start(job.id);
    await queue.idle();

    const done = store.get(job.id);
    expect(done.status).toBe("ready");
    expect(done.stages.denoise.status).toBe("skipped");
    expect(done.stages.transcribe.status).toBe("done");

    const persisted = JSON.parse(
      await readFile(path.join(workspaceDir, job.id, "job.json"), "utf8"),
    ) as { status: string };
    expect(persisted.status).toBe("ready");
  });

  it("stops at a failing stage with the user message and resumes on retry", async () => {
    let shouldFail = true;
    const { store, queue, service } = await setup(
      stages({
        transcribe: async () => {
          await Promise.resolve();
          if (shouldFail) {
            throw new AppError({
              code: "WHISPER_FAILED",
              message: "x",
              userMessage: "Transkrip gagal.",
            });
          }
        },
      }),
    );
    const job = await service.create(urlSource, undefined);
    service.start(job.id);
    await queue.idle();

    const failed = store.get(job.id);
    expect(failed.status).toBe("failed");
    expect(failed.error).toEqual({ code: "WHISPER_FAILED", userMessage: "Transkrip gagal." });
    expect(failed.stages.download.status).toBe("done");
    expect(failed.stages["find-moments"].status).toBe("pending");

    shouldFail = false;
    await service.retry(job.id);
    await queue.idle();
    expect(store.get(job.id).status).toBe("ready");
  });

  it("marks the job cancelled when the running stage is aborted", async () => {
    const { store, queue, service } = await setup(
      stages({
        download: (context) =>
          new Promise((_resolve, reject) => {
            context.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      }),
    );
    const job = await service.create(urlSource, undefined);
    service.start(job.id);
    await new Promise((resolve) => setTimeout(resolve, 30));
    await service.cancel(job.id);
    await queue.idle();
    expect(store.get(job.id).status).toBe("cancelled");
    expect(store.get(job.id).stages.download.status).toBe("cancelled");
  });

  it("rejects invalid settings with a validation error", async () => {
    const { service } = await setup(stages());
    await expect(
      service.create(urlSource, { minClipSec: 90, maxClipSec: 30 }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("recovers interrupted jobs after a restart", async () => {
    const first = await setup(stages());
    const job = await first.service.create(urlSource, undefined);
    await first.store.update(job.id, (draft) => {
      draft.status = "analyzing";
      draft.stages.download.status = "running";
    });

    const store = new JobStore(first.workspaceDir, logger);
    await store.load();
    const runTask = createPipelineRunner({
      config,
      store,
      logger,
      analysisStages: stages(),
      clipStages: [],
    });
    const queue = new JobQueue(runTask, logger);
    await new JobService(store, queue).recover();
    await queue.idle();
    expect(store.get(job.id).status).toBe("ready");
  });
});
