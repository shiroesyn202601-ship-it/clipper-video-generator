import type { AnalysisStage, ClipStage } from "../stage.ts";
import { simulatedAnalysisStages, simulatedClipStages } from "./simulated.ts";

/** Stages run in this order. Real implementations replace the simulated ones phase by phase. */
export const analysisStages: readonly AnalysisStage[] = simulatedAnalysisStages;

export const clipStages: readonly ClipStage[] = simulatedClipStages;
