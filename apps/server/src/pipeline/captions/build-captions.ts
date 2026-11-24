import {
  CAPTION_TUNING,
  type Caption,
  type Transcript,
  type TranscriptWord,
} from "@clipper/shared";

/** Gaps shorter than this between captions are closed so subtitles do not flicker (seconds). */
const FLICKER_GAP_SEC = 0.3;
/** A sentence end always closes a caption, even a one-word one ("sesuatu."). */
const ENDS_SENTENCE = /[.?!…]["')\]]*$/;
/** A clause end closes a caption only when it already holds two or more words. */
const ENDS_CLAUSE = /[,;:]["')\]]*$/;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Words of the transcript whose midpoint lies inside [startSec, endSec]. */
export function wordsInRange(
  transcript: Transcript,
  startSec: number,
  endSec: number,
): TranscriptWord[] {
  return transcript.segments
    .flatMap((segment) => segment.words)
    .filter((word) => {
      const middle = (word.startSec + word.endSec) / 2;
      return middle >= startSec && middle <= endSec;
    });
}

/**
 * Splits text into at most `maxLines` lines of roughly equal length, never breaking words.
 * Lines may exceed maxChars only when a single word is longer.
 */
export function wrapCaption(
  text: string,
  maxChars: number = CAPTION_TUNING.maxCharsPerLine,
  maxLines: number = CAPTION_TUNING.maxLines,
): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length <= maxChars || maxLines < 2 || words.length < 2) return words.join(" ");
  // Best two-line split: the break that minimizes the longer line.
  let bestIndex = 1;
  let bestLongest = Infinity;
  for (let index = 1; index < words.length; index++) {
    const longest = Math.max(
      words.slice(0, index).join(" ").length,
      words.slice(index).join(" ").length,
    );
    if (longest < bestLongest) {
      bestLongest = longest;
      bestIndex = index;
    }
  }
  return `${words.slice(0, bestIndex).join(" ")}\n${words.slice(bestIndex).join(" ")}`;
}

/**
 * Groups words into short, readable captions (CAPTION_TUNING) with clip-relative timings.
 * A caption closes at phrase punctuation, the word limit, the time limit or the character limit.
 */
export function buildCaptions(words: readonly TranscriptWord[], clipStartSec: number): Caption[] {
  const maxChars = CAPTION_TUNING.maxCharsPerLine * CAPTION_TUNING.maxLines;
  const groups: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  for (const word of words) {
    const first = current[0];
    const nextText = [...current, word].map((item) => item.text).join(" ");
    const wouldOverflow =
      current.length >= CAPTION_TUNING.maxWordsPerCaption ||
      nextText.length > maxChars ||
      (first !== undefined && word.endSec - first.startSec > CAPTION_TUNING.maxCaptionSec);
    if (current.length > 0 && wouldOverflow) {
      groups.push(current);
      current = [];
    }
    current.push(word);
    if (ENDS_SENTENCE.test(word.text) || (current.length >= 2 && ENDS_CLAUSE.test(word.text))) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  const captions = groups.map((group) => ({
    startSec: Math.max(0, round3((group[0]?.startSec ?? clipStartSec) - clipStartSec)),
    endSec: Math.max(0, round3((group.at(-1)?.endSec ?? clipStartSec) - clipStartSec)),
    text: wrapCaption(group.map((word) => word.text).join(" ")),
  }));
  for (let index = 0; index < captions.length - 1; index++) {
    const caption = captions[index];
    const next = captions[index + 1];
    if (caption && next && next.startSec - caption.endSec < FLICKER_GAP_SEC) {
      caption.endSec = next.startSec;
    }
  }
  return captions;
}
