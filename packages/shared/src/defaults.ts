/**
 * Tuning parameters in one place. Per-job overrides go through JobSettings;
 * algorithm constants (weights, thresholds) live here so results stay reproducible.
 */
export const DEFAULT_JOB_SETTINGS = {
  language: "id",
  minClipSec: 20,
  maxClipSec: 60,
  targetClipSec: 35,
  maxCandidates: 10,
  separateVocals: true,
  denoise: true,
  musicVolume: 0,
  subtitleStyle: "bold-center",
} as const;

export const CLIP_LIMITS = {
  minClipSec: 5,
  maxClipSec: 180,
  maxCandidates: 30,
} as const;

/** Moment scoring weights. Must sum to 1. */
export const MOMENT_WEIGHTS = {
  hook: 0.24,
  energy: 0.16,
  speechDensity: 0.14,
  silence: 0.1,
  completeness: 0.16,
  durationFit: 0.12,
  confidence: 0.08,
} as const;

export const MOMENT_TUNING = {
  /** A pause longer than this ends a sentence even without punctuation (seconds). */
  sentenceGapSec: 0.7,
  /** Pauses longer than this count against a window (seconds). */
  longPauseSec: 1.5,
  /** Ideal speaking rate range (words per second). */
  idealWordsPerSecMin: 2.2,
  idealWordsPerSecMax: 3.5,
  /** Max share of a candidate that may overlap an already selected one. */
  maxOverlapRatio: 0.2,
  /** Feature value above which a human-readable reason is added. */
  reasonThreshold: 0.7,
  /** At most this many reasons are shown per candidate. */
  maxReasons: 3,
} as const;

export const CAPTION_TUNING = {
  maxWordsPerCaption: 5,
  maxCaptionSec: 1.6,
  maxCharsPerLine: 18,
  maxLines: 2,
} as const;

export const RENDER_SETTINGS = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** Integrated loudness target for social platforms (LUFS). */
  loudnessLufs: -14,
} as const;
