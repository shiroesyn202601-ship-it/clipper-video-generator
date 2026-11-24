import {
  CONJUNCTIONS,
  HOOK_PHRASES,
  MOMENT_TUNING,
  type EnergyFile,
  type JobSettings,
} from "@clipper/shared";
import type { Sentence } from "@clipper/shared";

export const FEATURE_NAMES = [
  "hook",
  "energy",
  "speechDensity",
  "silence",
  "completeness",
  "durationFit",
  "confidence",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];
export type Features = Record<FeatureName, number>;

/** Energy steps quieter than this are treated as silence when ranking loudness (dBFS). */
const SPEECH_FLOOR_DB = -50;
/** Hook phrases are only looked for in the first words of a clip. */
const HOOK_WORD_WINDOW = 12;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, "");
}

const CONJUNCTION_SET: ReadonlySet<string> = new Set(CONJUNCTIONS);

/** Pre-computed loudness distribution of the whole episode, for percentile ranking. */
export type EnergyIndex = { stepSec: number; rmsDb: readonly number[]; sortedSpeechDb: number[] };

export function buildEnergyIndex(energy: EnergyFile | null): EnergyIndex | null {
  if (!energy || energy.rmsDb.length === 0) return null;
  const sortedSpeechDb = energy.rmsDb.filter((db) => db > SPEECH_FLOOR_DB).sort((a, b) => a - b);
  return { stepSec: energy.stepSec, rmsDb: energy.rmsDb, sortedSpeechDb };
}

/** Share of values in `sorted` that are below `value` (0..1). */
function percentileRank(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((sorted[middle] ?? Infinity) < value) low = middle + 1;
    else high = middle;
  }
  return sorted.length === 0 ? 0.5 : low / sorted.length;
}

function hookScore(sentences: readonly Sentence[]): number {
  const first = sentences[0];
  if (!first) return 0;
  if (/\?["')\]]*$/.test(first.text.trim())) return 1;
  const opening = ` ${first.words
    .slice(0, HOOK_WORD_WINDOW)
    .map((word) => normalizeWord(word.text))
    .join(" ")} `;
  return HOOK_PHRASES.some((phrase) => opening.includes(` ${phrase} `)) ? 0.8 : 0;
}

function energyScore(index: EnergyIndex | null, startSec: number, endSec: number): number {
  if (!index) return 0.5;
  const from = Math.floor(startSec / index.stepSec);
  const to = Math.max(from + 1, Math.ceil(endSec / index.stepSec));
  const slice = index.rmsDb.slice(from, to).filter((db) => db > SPEECH_FLOOR_DB);
  if (slice.length === 0) return 0;
  const average = slice.reduce((sum, db) => sum + db, 0) / slice.length;
  return percentileRank(index.sortedSpeechDb, average);
}

function speechDensityScore(wordCount: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const rate = wordCount / durationSec;
  const { idealWordsPerSecMin: min, idealWordsPerSecMax: max } = MOMENT_TUNING;
  if (rate >= min && rate <= max) return 1;
  // Falls to 0 at 1 word/s (too slow) or 5 words/s (too rushed to follow).
  return rate < min ? clamp01((rate - 1) / (min - 1)) : clamp01((5 - rate) / (5 - max));
}

function silenceScore(sentences: readonly Sentence[], durationSec: number): number {
  const words = sentences.flatMap((sentence) => sentence.words);
  let longPauseSec = 0;
  for (let index = 1; index < words.length; index++) {
    const gap = (words[index]?.startSec ?? 0) - (words[index - 1]?.endSec ?? 0);
    if (gap > MOMENT_TUNING.longPauseSec) longPauseSec += gap;
  }
  // A quarter of the clip spent in long pauses scores zero.
  return durationSec <= 0 ? 0 : clamp01(1 - longPauseSec / (durationSec * 0.25));
}

function completenessScore(sentences: readonly Sentence[]): number {
  const firstWord = normalizeWord(sentences[0]?.words[0]?.text ?? "");
  const lastSentence = sentences.at(-1);
  const lastWordRaw = lastSentence?.words.at(-1)?.text ?? "";
  const endsWithPunctuation = /[.?!…]["')\]]*$/.test(lastWordRaw);
  const lastWord = normalizeWord(lastWordRaw);
  let score = endsWithPunctuation ? (CONJUNCTION_SET.has(lastWord) ? 0.5 : 1) : 0.3;
  if (CONJUNCTION_SET.has(firstWord)) score *= 0.7;
  return score;
}

function durationFitScore(durationSec: number, settings: JobSettings): number {
  const spread = Math.max(
    settings.targetClipSec - settings.minClipSec,
    settings.maxClipSec - settings.targetClipSec,
    1,
  );
  return clamp01(1 - Math.abs(durationSec - settings.targetClipSec) / spread);
}

function confidenceScore(sentences: readonly Sentence[]): number {
  const words = sentences.flatMap((sentence) => sentence.words);
  if (words.length === 0) return 0;
  const average = words.reduce((sum, word) => sum + word.probability, 0) / words.length;
  // 0.5 average probability or less is unreliable; 0.95+ is as good as it gets.
  return clamp01((average - 0.5) / 0.45);
}

export function computeFeatures(
  sentences: readonly Sentence[],
  energy: EnergyIndex | null,
  settings: JobSettings,
): Features {
  const startSec = sentences[0]?.startSec ?? 0;
  const endSec = sentences.at(-1)?.endSec ?? startSec;
  const durationSec = endSec - startSec;
  const wordCount = sentences.reduce((sum, sentence) => sum + sentence.words.length, 0);
  return {
    hook: hookScore(sentences),
    energy: energyScore(energy, startSec, endSec),
    speechDensity: speechDensityScore(wordCount, durationSec),
    silence: silenceScore(sentences, durationSec),
    completeness: completenessScore(sentences),
    durationFit: durationFitScore(durationSec, settings),
    confidence: confidenceScore(sentences),
  };
}
