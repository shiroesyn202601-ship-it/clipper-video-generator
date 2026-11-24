import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ANALYSIS_STAGE_IDS, createStageState, jobSettingsSchema, type Job } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { disposableArtifacts, removeIntermediateAudio } from "./cleanup.ts";

function jobWith(artifacts: Job["artifacts"]): Job {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    createdAt: new Date().toISOString(),
    source: { kind: "url", url: "https://example.com" },
    title: null,
    durationSec: 60,
    status: "analyzing",
    stages: Object.fromEntries(
      ANALYSIS_STAGE_IDS.map((id) => [id, createStageState()]),
    ) as Job["stages"],
    settings: jobSettingsSchema.parse({}),
    artifacts,
    clips: [],
    error: null,
  };
}

describe("intermediate audio cleanup", () => {
  it("keeps the separated vocals when there is no denoised track", () => {
    const job = jobWith({
      audioFull: "audio/a.wav",
      audio16k: "audio/b.wav",
      vocals: "audio/v.wav",
    });
    expect(disposableArtifacts(job)).toEqual(["audioFull", "audio16k"]);
  });

  it("removes intermediate files but keeps what clips need", async () => {
    const jobDir = await mkdtemp(path.join(os.tmpdir(), "clipper-cleanup-"));
    await mkdir(path.join(jobDir, "audio"));
    const files = [
      "audio_full.wav",
      "audio16k.wav",
      "vocals.wav",
      "vocals_clean.wav",
      "no_vocals.wav",
    ];
    for (const file of files) await writeFile(path.join(jobDir, "audio", file), "x");

    const removed = await removeIntermediateAudio(
      jobDir,
      jobWith({
        audioFull: "audio/audio_full.wav",
        audio16k: "audio/audio16k.wav",
        vocals: "audio/vocals.wav",
        vocalsClean: "audio/vocals_clean.wav",
        noVocals: "audio/no_vocals.wav",
      }),
    );

    expect(removed).toEqual(["audioFull", "audio16k", "vocals"]);
    expect((await readdir(path.join(jobDir, "audio"))).sort()).toEqual([
      "no_vocals.wav",
      "vocals_clean.wav",
    ]);
  });
});
