import { MOMENT_TUNING, type Transcript, type TranscriptWord } from "@clipper/shared";

export type Sentence = {
  startSec: number;
  endSec: number;
  text: string;
  words: TranscriptWord[];
};

/** A sentence longer than this is split at the next comma (seconds). */
const SOFT_MAX_SENTENCE_SEC = 12;
/** A sentence longer than this is split at the next word, whatever it is (seconds). */
const HARD_MAX_SENTENCE_SEC = 20;

const ENDS_SENTENCE = /[.?!…]["')\]]*$/;
const ENDS_CLAUSE = /[,;:]["')\]]*$/;

/**
 * Groups transcript words into sentences: split on end punctuation or a pause longer than
 * MOMENT_TUNING.sentenceGapSec. Unpunctuated monologues are capped so clips can still be built.
 */
export function splitSentences(transcript: Transcript): Sentence[] {
  const words = transcript.segments.flatMap((segment) => segment.words);
  const sentences: Sentence[] = [];
  let current: TranscriptWord[] = [];

  const flush = (): void => {
    const first = current[0];
    const last = current.at(-1);
    if (first && last) {
      sentences.push({
        startSec: first.startSec,
        endSec: last.endSec,
        text: current.map((word) => word.text).join(" "),
        words: current,
      });
    }
    current = [];
  };

  words.forEach((word, index) => {
    current.push(word);
    const next = words[index + 1];
    const duration = word.endSec - (current[0]?.startSec ?? word.startSec);
    const gap = next ? next.startSec - word.endSec : Infinity;
    const shouldSplit =
      ENDS_SENTENCE.test(word.text) ||
      gap > MOMENT_TUNING.sentenceGapSec ||
      (duration >= SOFT_MAX_SENTENCE_SEC && ENDS_CLAUSE.test(word.text)) ||
      duration >= HARD_MAX_SENTENCE_SEC;
    if (shouldSplit) flush();
  });
  flush();
  return sentences;
}
