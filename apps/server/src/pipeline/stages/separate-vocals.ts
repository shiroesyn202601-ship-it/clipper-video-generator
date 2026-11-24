import path from "node:path";
import { resolveInside, toJobRelative } from "../../lib/fs-utils.ts";
import { outputPath, runWorker } from "../../tools/worker.ts";
import type { AnalysisStage } from "../stage.ts";
import { requireArtifact } from "./artifacts.ts";

export const separateVocalsStage: AnalysisStage = {
  id: "separate-vocals",
  run: async (context) => {
    const job = context.job();
    const input = resolveInside(context.jobDir, requireArtifact(job, "audioFull"));
    const outputs = await runWorker({
      config: context.config,
      module: "separate_vocals",
      args: [
        "--input",
        input,
        "--output",
        path.join(context.jobDir, "audio"),
        "--model",
        context.config.demucs.model,
        "--device",
        context.config.demucs.device,
      ],
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction, message) => context.reportProgress(fraction, message),
      errorCode: "DEMUCS_FAILED",
      userMessages: {
        default: "Pemisahan suara (Demucs) gagal. Lihat log.",
        CUDA_UNAVAILABLE: "DEMUCS_DEVICE=cuda tetapi GPU CUDA tidak tersedia. Ubah ke cpu di .env.",
      },
    });
    await context.setArtifacts({
      vocals: toJobRelative(context.jobDir, outputPath(outputs, "vocals")),
      noVocals: toJobRelative(context.jobDir, outputPath(outputs, "noVocals")),
    });
  },
};
