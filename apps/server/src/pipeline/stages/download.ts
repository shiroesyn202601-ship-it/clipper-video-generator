import { mkdir } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../../lib/errors.ts";
import { resolveInside, toJobRelative } from "../../lib/fs-utils.ts";
import { probeMedia } from "../../tools/ffmpeg.ts";
import { downloadVideo } from "../../tools/ytdlp.ts";
import type { AnalysisStage } from "../stage.ts";

/**
 * URL source: download with yt-dlp. File source: the upload is already in source/,
 * so this stage only validates it. Both end with title + duration on the job.
 */
export const downloadStage: AnalysisStage = {
  id: "download",
  run: async (context) => {
    const job = context.job();
    const sourceDir = path.join(context.jobDir, "source");
    await mkdir(sourceDir, { recursive: true });

    let videoPath: string;
    let title = job.title;
    let durationSec: number | null = null;

    if (job.source.kind === "url") {
      const result = await downloadVideo({
        config: context.config,
        url: job.source.url,
        outDir: sourceDir,
        signal: context.signal,
        logFile: context.logFile,
        onProgress: (fraction) => context.reportProgress(fraction),
      });
      videoPath = result.videoPath;
      title = result.title ?? title;
      durationSec = result.durationSec;
      await context.setArtifacts({
        sourceVideo: toJobRelative(context.jobDir, videoPath),
        ...(result.infoPath ? { sourceInfo: toJobRelative(context.jobDir, result.infoPath) } : {}),
      });
    } else {
      const relative = job.artifacts.sourceVideo;
      if (!relative) {
        throw new AppError({
          code: "UPLOAD_MISSING",
          message: "File source without uploaded video",
          userMessage: "File upload tidak ditemukan. Buat job baru.",
        });
      }
      videoPath = resolveInside(context.jobDir, relative);
    }

    const media = await probeMedia(context.config, videoPath);
    if (!media.hasVideo || !media.hasAudio) {
      throw new AppError({
        code: "SOURCE_INVALID",
        message: `Source lacks video or audio: video=${media.hasVideo} audio=${media.hasAudio}`,
        userMessage: "Video harus memiliki gambar dan suara.",
      });
    }
    await context.updateJob((draft) => {
      draft.title = title;
      draft.durationSec = media.durationSec || durationSec;
    });
  },
};
