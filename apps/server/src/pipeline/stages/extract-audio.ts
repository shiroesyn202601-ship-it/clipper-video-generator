import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveInside, toJobRelative } from "../../lib/fs-utils.ts";
import { runFfmpeg } from "../../tools/ffmpeg.ts";
import type { AnalysisStage } from "../stage.ts";
import { requireArtifact } from "./artifacts.ts";

/** 44.1 kHz stereo WAV: the input demucs expects. */
export const extractAudioStage: AnalysisStage = {
  id: "extract-audio",
  run: async (context) => {
    const job = context.job();
    const sourceVideo = resolveInside(context.jobDir, requireArtifact(job, "sourceVideo"));
    const audioDir = path.join(context.jobDir, "audio");
    await mkdir(audioDir, { recursive: true });
    const outputPath = path.join(audioDir, "audio_full.wav");

    await runFfmpeg({
      config: context.config,
      args: ["-i", sourceVideo, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le"],
      outputPath,
      durationSec: job.durationSec ?? 0,
      onProgress: (fraction) => context.reportProgress(fraction),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "EXTRACT_AUDIO_FAILED",
      userMessage: "Audio tidak bisa diambil dari video. Lihat log.",
    });
    await context.setArtifacts({ audioFull: toJobRelative(context.jobDir, outputPath) });
  },
};
