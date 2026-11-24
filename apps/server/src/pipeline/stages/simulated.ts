import { ANALYSIS_STAGE_IDS, CLIP_STAGE_IDS } from "@clipper/shared";
import { AppError } from "../../lib/errors.ts";
import type { AnalysisStage, ClipStage } from "../stage.ts";

/**
 * Placeholder stages that only simulate progress. Used while a real stage is not implemented yet
 * so the whole job flow (queue, SSE, UI) can be exercised end to end.
 */
async function simulate(
  signal: AbortSignal,
  report: (fraction: number) => void,
  durationMs = 1200,
): Promise<void> {
  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    if (signal.aborted)
      throw new AppError({
        code: "CANCELLED",
        message: "cancelled",
        userMessage: "Proses dibatalkan.",
      });
    await new Promise((resolve) => setTimeout(resolve, durationMs / steps));
    report(step / steps);
  }
}

export const simulatedAnalysisStages: AnalysisStage[] = ANALYSIS_STAGE_IDS.map((id) => ({
  id,
  run: (context) => simulate(context.signal, (fraction) => context.reportProgress(fraction)),
}));

export const simulatedClipStages: ClipStage[] = CLIP_STAGE_IDS.map((id) => ({
  id,
  run: (context) => simulate(context.signal, (fraction) => context.reportProgress(fraction)),
}));
