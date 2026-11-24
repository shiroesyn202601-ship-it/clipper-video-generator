import { Button } from "../../components/ui/Button.tsx";
import { copy } from "../../lib/copy.ts";
import { formatTimestamp } from "../../lib/format.ts";
import styles from "./RangeControls.module.css";

/** Boundaries closer than this are treated as the same position (seconds). */
const EPSILON = 0.05;

export function previousBoundary(boundaries: readonly number[], current: number): number | null {
  const earlier = boundaries.filter((value) => value < current - EPSILON);
  return earlier.length > 0 ? (earlier.at(-1) ?? null) : null;
}

export function nextBoundary(boundaries: readonly number[], current: number): number | null {
  return boundaries.find((value) => value > current + EPSILON) ?? null;
}

type RangeControlsProps = {
  startSec: number;
  endSec: number;
  /** Sorted sentence start times, used to move the clip start. */
  sentenceStarts: readonly number[];
  /** Sorted sentence end times, used to move the clip end. */
  sentenceEnds: readonly number[];
  isDisabled: boolean;
  onChange: (range: { startSec: number; endSec: number }) => void;
};

/**
 * Clip edges move one sentence at a time, so a clip can never start or end mid-sentence.
 */
export function RangeControls({
  startSec,
  endSec,
  sentenceStarts,
  sentenceEnds,
  isDisabled,
  onChange,
}: RangeControlsProps) {
  const startBack = previousBoundary(sentenceStarts, startSec);
  const startForward = nextBoundary(
    sentenceStarts.filter((value) => value < endSec),
    startSec,
  );
  const endBack = previousBoundary(
    sentenceEnds.filter((value) => value > startSec),
    endSec,
  );
  const endForward = nextBoundary(sentenceEnds, endSec);

  const row = (
    label: string,
    value: number,
    back: number | null,
    forward: number | null,
    apply: (value: number) => void,
  ) => (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <Button
        variant="ghost"
        aria-label={`${label}: ${copy.clipEditor.earlierSentence}`}
        disabled={isDisabled || back === null}
        onClick={() => back !== null && apply(back)}
      >
        ←
      </Button>
      <span className={styles.value}>{formatTimestamp(value)}</span>
      <Button
        variant="ghost"
        aria-label={`${label}: ${copy.clipEditor.laterSentence}`}
        disabled={isDisabled || forward === null}
        onClick={() => forward !== null && apply(forward)}
      >
        →
      </Button>
    </div>
  );

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {copy.clipEditor.range}
        <span className={styles.duration}>
          {copy.candidates.duration(Math.round(endSec - startSec))}
        </span>
      </legend>
      {row(copy.clipEditor.start, startSec, startBack, startForward, (value) =>
        onChange({ startSec: value, endSec }),
      )}
      {row(copy.clipEditor.end, endSec, endBack, endForward, (value) =>
        onChange({ startSec, endSec: value }),
      )}
    </fieldset>
  );
}
