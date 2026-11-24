import type { Transcript, TranscriptSegment, TranscriptWord } from "@clipper/shared";
import { z } from "zod";

/** Groq / OpenAI `verbose_json` transcription body (only the fields we use). */
export const groqRawSchema = z.object({
  language: z.string().optional(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        avg_logprob: z.number().optional(),
        no_speech_prob: z.number().optional(),
      }),
    )
    .default([]),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).default([]),
});
export type GroqRaw = z.infer<typeof groqRawSchema>;

export type GroqChunk = { offsetSec: number; raw: GroqRaw };

/** Segments Whisper itself thinks are silence or noise. */
const NO_SPEECH_THRESHOLD = 0.8;
const ANNOTATION = /\[[^\]]*\]|\([^)]*\)/g;

const LANGUAGE_CODES: Record<string, string> = {
  indonesian: "id",
  english: "en",
  malay: "ms",
  javanese: "jw",
  sundanese: "su",
};

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .trim();
}

/** "Indonesian" → "id"; codes pass through. */
export function toLanguageCode(language: string | undefined, fallback: string): string {
  if (!language) return fallback;
  const lower = language.toLowerCase();
  if (/^[a-z]{2,3}$/.test(lower)) return lower;
  return LANGUAGE_CODES[lower] ?? fallback;
}

/**
 * Groq's word list has no punctuation, but the segment text does, and sentence detection
 * needs it. Matches words to segment tokens in order and takes the punctuated spelling.
 */
export function punctuateWords(words: readonly string[], segmentText: string): string[] {
  const tokens = segmentText.split(/\s+/).filter((token) => comparable(token).length > 0);
  const result: string[] = [];
  let cursor = 0;
  for (const word of words) {
    const target = comparable(word);
    let matched: string | null = null;
    for (let look = cursor; look < Math.min(tokens.length, cursor + 4); look += 1) {
      const token = tokens[look];
      if (token !== undefined && comparable(token) === target) {
        matched = token;
        cursor = look + 1;
        break;
      }
    }
    result.push(matched ?? word.trim());
  }
  return result;
}

/** Probability-like confidence from Whisper's average log-probability. */
function segmentConfidence(avgLogprob: number | undefined): number {
  if (avgLogprob === undefined) return 0.8;
  return round3(Math.min(1, Math.max(0, Math.exp(avgLogprob))));
}

/**
 * Joins per-chunk Groq results into our Transcript schema: absolute timings, words grouped
 * under their segment, punctuation restored, silence/annotations and repeated segments dropped.
 */
export function normalizeGroq(chunks: readonly GroqChunk[], fallbackLanguage: string): Transcript {
  const segments: TranscriptSegment[] = [];
  let previousText = "";
  let language: string | undefined;

  for (const { offsetSec, raw } of chunks) {
    language ??= raw.language;
    const words = [...raw.words].sort((a, b) => a.start - b.start);
    let wordIndex = 0;
    raw.segments.forEach((segment, index) => {
      const nextStart = raw.segments[index + 1]?.start ?? Number.POSITIVE_INFINITY;
      // A word belongs to the segment it starts in (before the next segment begins).
      const own: GroqRaw["words"] = [];
      while (wordIndex < words.length) {
        const word = words[wordIndex];
        if (word === undefined || word.start >= nextStart) break;
        own.push(word);
        wordIndex += 1;
      }
      const text = segment.text.replace(ANNOTATION, "").replace(/\s+/g, " ").trim();
      if ((segment.no_speech_prob ?? 0) > NO_SPEECH_THRESHOLD) return;
      if (text.length === 0 || own.length === 0) return;
      const key = comparable(text);
      if (key === previousText) return;
      previousText = key;

      const probability = segmentConfidence(segment.avg_logprob);
      const spelled = punctuateWords(
        own.map((word) => word.word),
        text,
      );
      const timed: TranscriptWord[] = own
        .map((word, i) => ({
          text: (spelled[i] ?? word.word).trim(),
          startSec: round3(offsetSec + word.start),
          endSec: round3(offsetSec + Math.max(word.end, word.start)),
          probability,
        }))
        .filter((word) => comparable(word.text).length > 0);
      const first = timed[0];
      const last = timed.at(-1);
      if (!first || !last) return;
      segments.push({
        id: segments.length,
        startSec: first.startSec,
        endSec: last.endSec,
        text,
        words: timed,
      });
    });
  }

  return { language: toLanguageCode(language, fallbackLanguage), segments };
}

/** Parses ffmpeg `silencedetect` stderr into the midpoint of each silence (seconds). */
export function parseSilences(lines: readonly string[]): number[] {
  const midpoints: number[] = [];
  let start: number | null = null;
  for (const line of lines) {
    const startMatch = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (startMatch?.[1]) {
      start = Math.max(0, Number(startMatch[1]));
      continue;
    }
    const endMatch = /silence_end:\s*([\d.]+)/.exec(line);
    if (endMatch?.[1] && start !== null) {
      midpoints.push(round3((start + Number(endMatch[1])) / 2));
      start = null;
    }
  }
  return midpoints;
}

export type ChunkRange = { startSec: number; endSec: number };

/**
 * Splits the audio into pieces of about `targetSec`, cutting in the silence closest to each
 * target point (within `searchSec`) so no word is cut in half.
 */
export function planChunks(
  durationSec: number,
  silences: readonly number[],
  targetSec: number,
  searchSec: number,
): ChunkRange[] {
  const chunks: ChunkRange[] = [];
  let start = 0;
  while (durationSec - start > targetSec + searchSec) {
    const target = start + targetSec;
    const candidates = silences.filter(
      (point) => point > start + targetSec - searchSec && point <= target + searchSec,
    );
    const cut = candidates.reduce<number>(
      (best, point) => (Math.abs(point - target) < Math.abs(best - target) ? point : best),
      candidates[0] ?? target,
    );
    chunks.push({ startSec: round3(start), endSec: round3(cut) });
    start = cut;
  }
  chunks.push({ startSec: round3(start), endSec: round3(durationSec) });
  return chunks;
}
