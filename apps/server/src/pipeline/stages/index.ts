import type { AnalysisStage, ClipStage } from "../stage.ts";
import { downloadStage } from "./download.ts";
import { extractAudioStage } from "./extract-audio.ts";
import { simulatedAnalysisStages, simulatedClipStages } from "./simulated.ts";

const simulated = (id: AnalysisStage["id"]): AnalysisStage => {
  const stage = simulatedAnalysisStages.find((item) => item.id === id);
  if (!stage) throw new Error(`No simulated stage ${id}`);
  return stage;
};

/** Stages run in this order. Real implementations replace the simulated ones phase by phase. */
export const analysisStages: readonly AnalysisStage[] = [
  downloadStage,
  extractAudioStage,
  simulated("separate-vocals"),
  simulated("denoise"),
  simulated("transcribe"),
  simulated("find-moments"),
];

export const clipStages: readonly ClipStage[] = simulatedClipStages;
