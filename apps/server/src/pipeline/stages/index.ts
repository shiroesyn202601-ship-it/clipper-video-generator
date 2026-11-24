import type { AnalysisStage, ClipStage } from "../stage.ts";
import { denoiseStage } from "./denoise.ts";
import { downloadStage } from "./download.ts";
import { extractAudioStage } from "./extract-audio.ts";
import { findMomentsStage } from "./find-moments.ts";
import { separateVocalsStage } from "./separate-vocals.ts";
import { transcribeStage } from "./transcribe.ts";
import { reframeStage } from "./reframe.ts";
import { simulatedClipStages } from "./simulated.ts";
import { trackFacesStage } from "./track-faces.ts";

/** Stages run in this order. The render stage is still simulated until phase 8. */
export const analysisStages: readonly AnalysisStage[] = [
  downloadStage,
  extractAudioStage,
  separateVocalsStage,
  denoiseStage,
  transcribeStage,
  findMomentsStage,
];

const simulatedRender = simulatedClipStages.find((stage) => stage.id === "render");
if (!simulatedRender) throw new Error("missing simulated render stage");

export const clipStages: readonly ClipStage[] = [trackFacesStage, reframeStage, simulatedRender];
