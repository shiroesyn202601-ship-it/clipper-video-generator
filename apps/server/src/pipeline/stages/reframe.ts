import { rm } from "node:fs/promises";
import path from "node:path";
import { RENDER_SETTINGS } from "@clipper/shared";
import { resolveInside } from "../../lib/fs-utils.ts";
import { runFfmpeg } from "../../tools/ffmpeg.ts";
import { normalizeLoudness, type LoudnessTarget } from "../../tools/loudness.ts";
import { runWorker } from "../../tools/worker.ts";
import type { ClipStage } from "../stage.ts";
import { cleanVocalsArtifact, requireArtifact } from "./artifacts.ts";

/** Share of the stage progress used by the video crop (the rest prepares audio). */
const VIDEO_SHARE = 0.85;

const LOUDNESS_TARGET: LoudnessTarget = {
  integratedLufs: RENDER_SETTINGS.loudnessLufs,
  // -2 dB leaves headroom for the AAC encoder, which overshoots peaks by ~1 dB.
  truePeakDb: -2,
};

/** Mixes clean speech with the music stem (when wanted); loudness is normalized afterwards. */
export function clipMixFilter(musicVolume: number): string {
  if (musicVolume <= 0) return "[0:a]anull[out]";
  return (
    `[1:a]volume=${musicVolume.toFixed(2)}[music];` +
    "[0:a][music]amix=inputs=2:duration=first:normalize=0[out]"
  );
}

export const reframeStage: ClipStage = {
  id: "reframe",
  run: async (context) => {
    const job = context.job();
    const clip = context.clip();
    const start = clip.startSec.toFixed(3);
    const durationSec = clip.endSec - clip.startSec;
    const duration = durationSec.toFixed(3);
    const audioProgress = (step: number, fraction: number): void =>
      context.reportProgress(VIDEO_SHARE + ((step + fraction) / 2) * (1 - VIDEO_SHARE));

    await runWorker({
      config: context.config,
      module: "reframe",
      args: [
        "--input",
        resolveInside(context.jobDir, requireArtifact(job, "sourceVideo")),
        "--faces",
        path.join(context.clipDir, "faces.json"),
        "--start",
        start,
        "--end",
        clip.endSec.toFixed(3),
        "--ffmpeg",
        context.config.bins.ffmpeg,
        "--width",
        String(RENDER_SETTINGS.width),
        "--height",
        String(RENDER_SETTINGS.height),
        "--output",
        context.clipDir,
      ],
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction, message) => context.reportProgress(fraction * VIDEO_SHARE, message),
      errorCode: "REFRAME_FAILED",
      userMessages: { default: "Crop 9:16 gagal. Lihat log." },
    });

    // 1) Cut (and optionally mix) the clip audio.
    const vocals = resolveInside(context.jobDir, cleanVocalsArtifact(job));
    const music = job.artifacts.noVocals
      ? resolveInside(context.jobDir, job.artifacts.noVocals)
      : null;
    const useMusic = job.settings.musicVolume > 0 && music !== null;
    const mixPath = path.join(context.clipDir, "mix.wav");
    await runFfmpeg({
      config: context.config,
      args: [
        "-ss",
        start,
        "-t",
        duration,
        "-i",
        vocals,
        ...(useMusic ? ["-ss", start, "-t", duration, "-i", music] : []),
        "-filter_complex",
        clipMixFilter(useMusic ? job.settings.musicVolume : 0),
        "-map",
        "[out]",
        "-c:a",
        "pcm_s16le",
      ],
      outputPath: mixPath,
      durationSec,
      onProgress: (fraction) => audioProgress(0, fraction),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "CLIP_AUDIO_FAILED",
      userMessage: "Audio klip tidak bisa disiapkan. Lihat log.",
    });

    // 2) Compress, apply measured gain, limit peaks; corrected until on target.
    await normalizeLoudness({
      config: context.config,
      input: mixPath,
      output: path.join(context.clipDir, "audio.wav"),
      durationSec,
      target: LOUDNESS_TARGET,
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction) => audioProgress(1, fraction),
    });
    await rm(mixPath, { force: true });
  },
};
