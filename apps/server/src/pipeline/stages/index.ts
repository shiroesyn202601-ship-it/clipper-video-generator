import type { AnalysisStage, ClipStage } from "../stage.ts";
import { denoiseStage } from "./denoise.ts";
import { downloadStage } from "./download.ts";
import { extractAudioStage } from "./extract-audio.ts";
import { findMomentsStage } from "./find-moments.ts";
import { reframeStage } from "./reframe.ts";
import { renderStage } from "./render.ts";
import { separateVocalsStage } from "./separate-vocals.ts";
import { trackFacesStage } from "./track-faces.ts";
import { transcribeStage } from "./transcribe.ts";

/** Analysis stages run in this order for every job. */
export const analysisStages: readonly AnalysisStage[] = [
  downloadStage,
  extractAudioStage,
  separateVocalsStage,
  denoiseStage,
  transcribeStage,
  findMomentsStage,
];

/** Clip stages run in this order when the user renders a clip. */
export const clipStages: readonly ClipStage[] = [trackFacesStage, reframeStage, renderStage];
