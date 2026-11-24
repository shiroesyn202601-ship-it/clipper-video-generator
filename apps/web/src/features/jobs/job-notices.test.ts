import { jobSchema, type Job } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { copy } from "../../lib/copy.ts";
import { jobNotices } from "./job-notices.ts";

const stage = (status: string, message: string | null = null) => ({
  status,
  progress: status === "done" ? 1 : 0,
  startedAt: null,
  finishedAt: null,
  message,
});

function makeJob(overrides: Partial<Record<string, unknown>> = {}): Job {
  return jobSchema.parse({
    id: "job1",
    createdAt: "2026-11-24T00:00:00.000Z",
    source: { kind: "url", url: "https://example.com/v" },
    title: "Podcast A",
    durationSec: 3600,
    status: "analyzing",
    stages: {
      download: stage("done"),
      "extract-audio": stage("done"),
      "separate-vocals": stage("skipped"),
      denoise: stage("skipped"),
      transcribe: stage("running"),
      "find-moments": stage("pending"),
    },
    settings: {},
    artifacts: {},
    clips: [],
    error: null,
    ...overrides,
  });
}

const clip = (output: string | null, error: { code: string; userMessage: string } | null) => ({
  id: "clip1",
  candidateId: "c1",
  createdAt: "2026-11-24T00:00:00.000Z",
  startSec: 0,
  endSec: 30,
  captions: [],
  stages: { "track-faces": stage("done"), reframe: stage("done"), render: stage("running") },
  output,
  error,
});

describe("jobNotices", () => {
  it("stays quiet on the first snapshot", () => {
    expect(jobNotices(undefined, makeJob({ status: "ready" }))).toEqual([]);
  });

  it("announces a finished transcript with the engine note", () => {
    const before = makeJob();
    const after = makeJob({
      stages: { ...before.stages, transcribe: stage("done", "Ditranskrip online (Groq)") },
    });
    expect(jobNotices(before, after)).toEqual([
      {
        title: copy.notifications.transcribed,
        body: "Podcast A\nDitranskrip online (Groq)",
        tag: "job-job1",
      },
    ]);
  });

  it("announces a ready or failed job", () => {
    const before = makeJob();
    expect(jobNotices(before, makeJob({ status: "ready" }))[0]?.title).toBe(
      copy.notifications.ready,
    );
    const failed = makeJob({
      status: "failed",
      error: { code: "X", userMessage: "Video tidak bisa diunduh" },
    });
    expect(jobNotices(before, failed)[0]).toMatchObject({
      title: copy.notifications.failed,
      body: "Podcast A\nVideo tidak bisa diunduh",
    });
  });

  it("announces a finished or failed clip render", () => {
    const before = makeJob({ status: "ready", clips: [clip(null, null)] });
    const done = makeJob({ status: "ready", clips: [clip("clips/clip1/final.mp4", null)] });
    expect(jobNotices(before, done)).toEqual([
      { title: copy.notifications.rendered, body: "Podcast A", tag: "clip-clip1" },
    ]);
    const failed = makeJob({
      status: "ready",
      clips: [clip(null, { code: "R", userMessage: "Render gagal" })],
    });
    expect(jobNotices(before, failed)[0]?.title).toBe(copy.notifications.renderFailed);
  });
});
