import path from "node:path";
import { RENDER_SETTINGS } from "@clipper/shared";
import { resolveInside } from "../../lib/fs-utils.ts";
import { runFfmpeg } from "../../tools/ffmpeg.ts";
import { runWorker } from "../../tools/worker.ts";
import type { ClipStage } from "../stage.ts";
import { cleanVocalsArtifact, requireArtifact } from "./artifacts.ts";

/** Share of the stage progress used by the video crop (the rest prepares audio). */
const VIDEO_SHARE = 0.9;

/**
 * Builds the clip's audio: clean speech, optionally mixed with the music stem, normalized to
 * the platform loudness target.
 */
export function clipAudioFilter(musicVolume: number): string {
  const loudnorm = `loudnorm=I=${RENDER_SETTINGS.loudnessLufs}:TP=-1.5:LRA=11`;
  if (musicVolume <= 0) return `[0:a]${loudnorm},aresample=48000[out]`;
  return (
    `[1:a]volume=${musicVolume.toFixed(2)}[music];` +
    `[0:a][music]amix=inputs=2:duration=first:normalize=0,${loudnorm},aresample=48000[out]`
  );
}

export const reframeStage: ClipStage = {
  id: "reframe",
  run: async (context) => {
    const job = context.job();
    const clip = context.clip();
    const start = clip.startSec.toFixed(3);
    const duration = (clip.endSec - clip.startSec).toFixed(3);

    await runWorker({
      config: context.config,
      module: "reframe",
      args: [
        "--input",
        resolveInside(context.jobDir, requireArtifact(job, "sourceVideo")),
        "--faces",
        path.join(context.clipDir, "faces.json"),
        "--start",
        clip.startSec.toFixed(3),
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

    const vocals = resolveInside(context.jobDir, cleanVocalsArtifact(job));
    const music = job.artifacts.noVocals
      ? resolveInside(context.jobDir, job.artifacts.noVocals)
      : null;
    const useMusic = job.settings.musicVolume > 0 && music !== null;
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
        clipAudioFilter(useMusic ? job.settings.musicVolume : 0),
        "-map",
        "[out]",
        "-c:a",
        "pcm_s16le",
      ],
      outputPath: path.join(context.clipDir, "audio.wav"),
      durationSec: clip.endSec - clip.startSec,
      onProgress: (fraction) => context.reportProgress(VIDEO_SHARE + fraction * (1 - VIDEO_SHARE)),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "CLIP_AUDIO_FAILED",
      userMessage: "Audio klip tidak bisa disiapkan. Lihat log.",
    });
  },
};
