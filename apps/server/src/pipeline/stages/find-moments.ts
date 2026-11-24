import { mkdir } from "node:fs/promises";
import path from "node:path";
import { energyFileSchema, transcriptSchema } from "@clipper/shared";
import { readJson, resolveInside, toJobRelative, writeJsonAtomic } from "../../lib/fs-utils.ts";
import { outputPath, runWorker } from "../../tools/worker.ts";
import { findMoments } from "../moments/find-moments.ts";
import type { AnalysisStage } from "../stage.ts";
import { requireArtifact } from "./artifacts.ts";

/** Share of the stage progress used by the energy worker. */
const ENERGY_SHARE = 0.7;

export const findMomentsStage: AnalysisStage = {
  id: "find-moments",
  run: async (context) => {
    const job = context.job();
    const audio16k = resolveInside(context.jobDir, requireArtifact(job, "audio16k"));

    const outputs = await runWorker({
      config: context.config,
      module: "audio_energy",
      args: ["--input", audio16k, "--output", path.join(context.jobDir, "audio")],
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction) => context.reportProgress(fraction * ENERGY_SHARE, "Mengukur energi"),
      errorCode: "ENERGY_FAILED",
      userMessages: { default: "Pengukuran energi suara gagal. Lihat log." },
    });
    const energyPath = outputPath(outputs, "energy");
    await context.setArtifacts({ energy: toJobRelative(context.jobDir, energyPath) });

    context.reportProgress(ENERGY_SHARE, "Menilai momen");
    const transcript = await readJson(
      resolveInside(context.jobDir, requireArtifact(job, "transcript")),
      transcriptSchema,
    );
    const energy = await readJson(energyPath, energyFileSchema);
    const candidates = findMoments(transcript, energy, job.settings);

    const momentsDir = path.join(context.jobDir, "moments");
    await mkdir(momentsDir, { recursive: true });
    const candidatesPath = path.join(momentsDir, "candidates.json");
    await writeJsonAtomic(candidatesPath, { candidates });
    await context.setArtifacts({ candidates: toJobRelative(context.jobDir, candidatesPath) });
  },
};
