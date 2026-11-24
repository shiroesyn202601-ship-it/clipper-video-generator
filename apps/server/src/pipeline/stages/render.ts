import { writeFile } from "node:fs/promises";
import path from "node:path";
import { RENDER_SETTINGS } from "@clipper/shared";
import { AppError } from "../../lib/errors.ts";
import { toJobRelative } from "../../lib/fs-utils.ts";
import { probeMedia, runFfmpeg } from "../../tools/ffmpeg.ts";
import { buildAss } from "../captions/ass.ts";
import type { ClipStage } from "../stage.ts";

/** Allowed difference between the rendered and the requested clip length (seconds). */
const DURATION_TOLERANCE_SEC = 0.5;

export const renderStage: ClipStage = {
  id: "render",
  run: async (context) => {
    const job = context.job();
    const clip = context.clip();
    const durationSec = clip.endSec - clip.startSec;

    const ass = buildAss(clip.captions, {
      style: job.settings.subtitleStyle,
      width: RENDER_SETTINGS.width,
      height: RENDER_SETTINGS.height,
    });
    await writeFile(path.join(context.clipDir, "captions.ass"), ass, "utf8");

    const outputPath = path.join(context.clipDir, "final.mp4");
    await runFfmpeg({
      config: context.config,
      // Relative names + cwd: the "ass" filter argument then needs no Windows path escaping.
      cwd: context.clipDir,
      args: [
        "-i",
        "reframed.mp4",
        "-i",
        "audio.wav",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        "ass=captions.ass",
        "-r",
        String(RENDER_SETTINGS.fps),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
      ],
      outputPath,
      durationSec,
      onProgress: (fraction) => context.reportProgress(fraction, "Merender"),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "RENDER_FAILED",
      userMessage: "Render klip gagal. Lihat log.",
    });

    const media = await probeMedia(context.config, outputPath);
    if (
      !media.hasVideo ||
      !media.hasAudio ||
      Math.abs(media.durationSec - durationSec) > DURATION_TOLERANCE_SEC
    ) {
      throw new AppError({
        code: "RENDER_INVALID",
        message: `final.mp4 check failed: video=${media.hasVideo} audio=${media.hasAudio} duration=${media.durationSec} expected=${durationSec}`,
        userMessage: "Hasil render tidak lengkap. Coba render ulang.",
      });
    }
    await context.updateClip((draft) => {
      draft.output = toJobRelative(context.jobDir, outputPath);
    });
  },
};
