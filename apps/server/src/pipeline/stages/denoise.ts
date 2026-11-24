import path from "node:path";
import { resolveInside, toJobRelative } from "../../lib/fs-utils.ts";
import { outputPath, runWorker } from "../../tools/worker.ts";
import type { AnalysisStage } from "../stage.ts";
import { requireArtifact } from "./artifacts.ts";

export const denoiseStage: AnalysisStage = {
  id: "denoise",
  // When skipped, later stages use the separated vocals directly (see cleanVocalsArtifact).
  shouldSkip: (job) => !job.settings.denoise,
  run: async (context) => {
    const job = context.job();
    const input = resolveInside(context.jobDir, requireArtifact(job, "vocals"));
    const outputs = await runWorker({
      config: context.config,
      module: "denoise",
      args: ["--input", input, "--output", path.join(context.jobDir, "audio")],
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction, message) => context.reportProgress(fraction, message),
      errorCode: "DENOISE_FAILED",
      userMessages: { default: "Pembersihan noise (DeepFilterNet) gagal. Lihat log." },
    });
    await context.setArtifacts({
      vocalsClean: toJobRelative(context.jobDir, outputPath(outputs, "vocalsClean")),
    });
  },
};
