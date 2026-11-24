import {
  MOMENT_TUNING,
  MOMENT_WEIGHTS,
  type ClipCandidate,
  type EnergyFile,
  type JobSettings,
  type Transcript,
} from "@clipper/shared";
import {
  buildEnergyIndex,
  computeFeatures,
  FEATURE_NAMES,
  type FeatureName,
  type Features,
} from "./features.ts";
import { splitSentences, type Sentence } from "@clipper/shared";

const REASONS: Record<keyof Features, (features: Features) => string> = {
  hook: (features) =>
    features.hook === 1 ? "Dibuka dengan pertanyaan" : "Kalimat pembuka yang memancing",
  energy: () => "Energi suara tinggi",
  speechDensity: () => "Tempo bicara pas",
  silence: () => "Minim jeda kosong",
  completeness: () => "Mulai dan selesai di kalimat utuh",
  durationFit: () => "Durasi mendekati target",
  confidence: () => "Ucapan terdengar jelas",
};

/** Mean value of every feature across a set of windows. */
export function featureMeans(all: readonly Features[]): Features {
  const means = Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Features;
  if (all.length === 0) return means;
  for (const name of FEATURE_NAMES) {
    means[name] = all.reduce((sum, features) => sum + features[name], 0) / all.length;
  }
  return means;
}

/**
 * At most MOMENT_TUNING.maxReasons reasons, chosen to tell candidates apart: passing features
 * ranked by how far they sit above the other candidates' mean (weighted). A hook always leads,
 * because it is what makes a clip worth watching. Without `means`, ranks by contribution.
 */
export function topReasons(features: Features, means?: Features): string[] {
  const distinctiveness = (name: FeatureName): number =>
    MOMENT_WEIGHTS[name] * (features[name] - (means ? means[name] : 0));
  return FEATURE_NAMES.filter((name) => features[name] >= MOMENT_TUNING.reasonThreshold)
    .sort((a, b) => {
      if (a === "hook" || b === "hook") return a === "hook" ? -1 : 1;
      return distinctiveness(b) - distinctiveness(a);
    })
    .slice(0, MOMENT_TUNING.maxReasons)
    .map((name) => REASONS[name](features));
}

export type Window = { sentences: Sentence[]; startSec: number; endSec: number };

/** All runs of consecutive sentences whose duration is within [minClipSec, maxClipSec]. */
export function generateWindows(sentences: readonly Sentence[], settings: JobSettings): Window[] {
  const windows: Window[] = [];
  for (let start = 0; start < sentences.length; start++) {
    const first = sentences[start];
    if (!first) continue;
    for (let end = start; end < sentences.length; end++) {
      const last = sentences[end];
      if (!last) break;
      const duration = last.endSec - first.startSec;
      if (duration > settings.maxClipSec) break;
      if (duration >= settings.minClipSec) {
        windows.push({
          sentences: sentences.slice(start, end + 1),
          startSec: first.startSec,
          endSec: last.endSec,
        });
      }
    }
  }
  return windows;
}

export function scoreFeatures(features: Features): number {
  const total = FEATURE_NAMES.reduce((sum, name) => sum + MOMENT_WEIGHTS[name] * features[name], 0);
  return Math.round(total * 1000) / 10;
}

function overlapSec(
  a: { startSec: number; endSec: number },
  b: { startSec: number; endSec: number },
) {
  return Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
}

/** Greedy pick by score; a window may overlap an accepted one by at most maxOverlapRatio. */
export function selectNonOverlapping<T extends { startSec: number; endSec: number; score: number }>(
  scored: readonly T[],
  maxCount: number,
): T[] {
  const sorted = [...scored].sort((a, b) => b.score - a.score || a.startSec - b.startSec);
  const selected: T[] = [];
  for (const candidate of sorted) {
    if (selected.length >= maxCount) break;
    const isAllowed = selected.every((chosen) => {
      const shorter = Math.min(
        candidate.endSec - candidate.startSec,
        chosen.endSec - chosen.startSec,
      );
      return overlapSec(candidate, chosen) <= MOMENT_TUNING.maxOverlapRatio * shorter;
    });
    if (isAllowed) selected.push(candidate);
  }
  return selected;
}

/** Full moment search: transcript (+ optional energy) → ranked, non-overlapping candidates. */
export function findMoments(
  transcript: Transcript,
  energy: EnergyFile | null,
  settings: JobSettings,
): ClipCandidate[] {
  const sentences = splitSentences(transcript);
  const energyIndex = buildEnergyIndex(energy);
  const scored = generateWindows(sentences, settings).map((window) => {
    const features = computeFeatures(window.sentences, energyIndex, settings);
    return { ...window, features, score: scoreFeatures(features) };
  });

  const selected = selectNonOverlapping(scored, settings.maxCandidates);
  const means = featureMeans(selected.map((window) => window.features));
  return selected.map((window) => ({
    // Deterministic id: the same input always yields the same candidate ids.
    id: `m${Math.round(window.startSec * 10)}-${Math.round(window.endSec * 10)}`,
    startSec: window.startSec,
    endSec: window.endSec,
    text: window.sentences.map((sentence) => sentence.text).join(" "),
    score: window.score,
    reasons: topReasons(window.features, means),
    features: Object.fromEntries(
      FEATURE_NAMES.map((name) => [name, Math.round(window.features[name] * 1000) / 1000]),
    ),
  }));
}
