import type { Transcript, TranscriptSegment, TranscriptWord } from "@clipper/shared";
import { z } from "zod";

/** Shape of `whisper-cli -ojf` output (only the fields we use). */
export const whisperRawSchema = z.object({
  result: z.object({ language: z.string() }).partial().optional(),
  transcription: z.array(
    z.object({
      offsets: z.object({ from: z.number(), to: z.number() }),
      text: z.string(),
      tokens: z
        .array(
          z.object({
            text: z.string(),
            offsets: z.object({ from: z.number(), to: z.number() }),
            p: z.number(),
          }),
        )
        .default([]),
    }),
  ),
});
export type WhisperRaw = z.infer<typeof whisperRawSchema>;

/** Special tokens like [_BEG_], [_TT_150], and non-speech annotations like [Music]. */
const SPECIAL_TOKEN = /^\s*\[[^\]]*\]\s*$/;
/** Tokens that are pure punctuation attach to the previous word. */
const PUNCTUATION_ONLY = /^[\p{P}\p{S}]+$/u;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\p{P}\s]+/gu, " ")
    .trim();
}

/** Merges whisper sub-word tokens into words with timings in seconds. */
export function tokensToWords(
  tokens: WhisperRaw["transcription"][number]["tokens"],
): TranscriptWord[] {
  const words: { text: string; startMs: number; endMs: number; probabilities: number[] }[] = [];
  for (const token of tokens) {
    if (SPECIAL_TOKEN.test(token.text) || token.text.length === 0) continue;
    const startsWord = /^\s/.test(token.text);
    const text = token.text.trim();
    if (text.length === 0) continue;
    const previous = words.at(-1);
    if (previous && (!startsWord || PUNCTUATION_ONLY.test(text))) {
      previous.text += text;
      previous.endMs = Math.max(previous.endMs, token.offsets.to);
      if (!PUNCTUATION_ONLY.test(text)) previous.probabilities.push(token.p);
      continue;
    }
    words.push({
      text,
      startMs: token.offsets.from,
      endMs: token.offsets.to,
      probabilities: [token.p],
    });
  }
  return words
    .filter((word) => !PUNCTUATION_ONLY.test(word.text))
    .map((word) => ({
      text: word.text,
      startSec: round3(word.startMs / 1000),
      endSec: round3(Math.max(word.endMs, word.startMs) / 1000),
      probability: round3(Math.min(1, Math.max(0, mean(word.probabilities)))),
    }));
}

/**
 * Converts raw whisper.cpp JSON into our Transcript schema:
 * words with second-based timings, special tokens removed, empty segments dropped and
 * consecutive duplicate segments (a known whisper repetition loop) collapsed.
 */
export function normalizeWhisper(raw: WhisperRaw, fallbackLanguage: string): Transcript {
  const segments: TranscriptSegment[] = [];
  let previousText = "";
  for (const item of raw.transcription) {
    const words = tokensToWords(item.tokens);
    const text = item.text.replace(/\[[^\]]*\]/g, "").trim();
    if (words.length === 0 || text.length === 0) continue;
    const comparable = normalizeForCompare(text);
    if (comparable === previousText) continue;
    previousText = comparable;
    const first = words[0];
    const last = words.at(-1);
    segments.push({
      id: segments.length,
      startSec: first ? first.startSec : round3(item.offsets.from / 1000),
      endSec: last ? last.endSec : round3(item.offsets.to / 1000),
      text,
      words,
    });
  }
  return { language: raw.result?.language ?? fallbackLanguage, segments };
}

/** WebVTT for the <track> element of the source preview. */
export function transcriptToVtt(transcript: Transcript): string {
  const stamp = (seconds: number): string => {
    const totalMs = Math.round(seconds * 1000);
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const secs = Math.floor((totalMs % 60_000) / 1000);
    const ms = totalMs % 1000;
    const pad = (value: number, size = 2): string => String(value).padStart(size, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(ms, 3)}`;
  };
  const cues = transcript.segments.map(
    (segment) =>
      `${stamp(segment.startSec)} --> ${stamp(segment.endSec)}\n${segment.text.replace(/-->/g, "→")}`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
