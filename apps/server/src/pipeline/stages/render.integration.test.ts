import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ANALYSIS_STAGE_IDS,
  RENDER_SETTINGS,
  createStageState,
  jobSettingsSchema,
  type Clip,
  type Job,
} from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { config } from "../../config.ts";
import { probeMedia } from "../../tools/ffmpeg.ts";
import { runProcess } from "../../tools/run-process.ts";
import type { ClipStageContext } from "../stage.ts";
import { renderStage } from "./render.ts";

const hasFfmpeg = await runProcess({ command: config.bins.ffmpeg, args: ["-version"] }).then(
  () => true,
  () => false,
);

const DURATION_SEC = 2;

/** Synthetic inputs the render stage expects in the clip folder. */
async function makeClipInputs(clipDir: string): Promise<void> {
  const { width, height, fps } = RENDER_SETTINGS;
  await runProcess({
    command: config.bins.ffmpeg,
    args: [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `testsrc=size=${width}x${height}:rate=${fps}:duration=${DURATION_SEC}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(clipDir, "reframed.mp4"),
    ],
  });
  await runProcess({
    command: config.bins.ffmpeg,
    args: [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${DURATION_SEC}:sample_rate=48000`,
      path.join(clipDir, "audio.wav"),
    ],
  });
}

describe.skipIf(!hasFfmpeg)("render stage (real ffmpeg)", () => {
  it("burns subtitles and writes a verified 9:16 MP4 with audio", async () => {
    const jobDir = await mkdtemp(path.join(os.tmpdir(), "clipper-render-"));
    const clipDir = path.join(jobDir, "clips", "c1");
    await mkdir(clipDir, { recursive: true });
    await makeClipInputs(clipDir);

    let clip: Clip = {
      id: "c1",
      candidateId: "m0-20",
      createdAt: new Date().toISOString(),
      startSec: 10,
      endSec: 10 + DURATION_SEC,
      // Braces and backslashes must not become ASS override tags.
      captions: [{ startSec: 0, endSec: 1.5, text: "Halo {\\b1}semua\nuji render" }],
      stages: {
        "track-faces": createStageState(),
        reframe: createStageState(),
        render: createStageState(),
      },
      output: null,
      error: null,
      renderRequestedAt: null,
      captionStyle: null,
    };
    const job: Job = {
      id: "job",
      createdAt: new Date().toISOString(),
      source: { kind: "url", url: "https://example.com" },
      title: null,
      durationSec: 60,
      status: "ready",
      stages: Object.fromEntries(
        ANALYSIS_STAGE_IDS.map((id) => [id, createStageState()]),
      ) as Job["stages"],
      settings: jobSettingsSchema.parse({}),
      artifacts: {},
      clips: [clip],
      error: null,
    };

    const context: ClipStageContext = {
      config,
      job: () => job,
      jobDir,
      signal: new AbortController().signal,
      logFile: path.join(jobDir, "logs", "render.log"),
      reportProgress: () => undefined,
      setArtifacts: () => Promise.resolve(),
      updateJob: () => Promise.resolve(),
      clip: () => clip,
      clipDir,
      updateClip: (mutate) => {
        const draft = structuredClone(clip);
        mutate(draft);
        clip = draft;
        return Promise.resolve();
      },
    };

    await renderStage.run(context);

    expect(clip.output).toBe("clips/c1/final.mp4");
    const media = await probeMedia(config, path.join(clipDir, "final.mp4"));
    expect(media).toMatchObject({ hasVideo: true, hasAudio: true, width: 1080, height: 1920 });
    expect(media.durationSec).toBeCloseTo(DURATION_SEC, 0);
  }, 60_000);
});
