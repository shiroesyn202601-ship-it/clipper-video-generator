import { resolveInside } from "../../lib/fs-utils.ts";
import { runWorker } from "../../tools/worker.ts";
import type { ClipStage } from "../stage.ts";
import { requireArtifact } from "./artifacts.ts";

export const trackFacesStage: ClipStage = {
  id: "track-faces",
  run: async (context) => {
    const job = context.job();
    const clip = context.clip();
    await runWorker({
      config: context.config,
      module: "track_faces",
      args: [
        "--input",
        resolveInside(context.jobDir, requireArtifact(job, "sourceVideo")),
        "--start",
        clip.startSec.toFixed(3),
        "--end",
        clip.endSec.toFixed(3),
        "--model",
        context.config.faceModel,
        "--ffmpeg",
        context.config.bins.ffmpeg,
        "--output",
        context.clipDir,
      ],
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction, message) => context.reportProgress(fraction, message),
      errorCode: "TRACK_FACES_FAILED",
      userMessages: {
        default: "Deteksi wajah gagal. Lihat log.",
        INPUT_NOT_FOUND: "Model wajah YuNet tidak ditemukan. Ikuti SETUP.md langkah 5.",
      },
    });
  },
};
