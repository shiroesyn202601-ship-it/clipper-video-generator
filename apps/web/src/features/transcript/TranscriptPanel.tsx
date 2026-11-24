import type { TranscriptSegment } from "@clipper/shared";
import { useEffect, useRef } from "react";
import { copy } from "../../lib/copy.ts";
import { formatDuration } from "../../lib/format.ts";
import styles from "./TranscriptPanel.module.css";

type TranscriptPanelProps = {
  segments: readonly TranscriptSegment[];
  currentTimeSec: number;
  onSeek: (timeSec: number) => void;
};

/** Index of the segment playing at `timeSec` (binary search; segments are sorted). */
export function findActiveSegment(segments: readonly TranscriptSegment[], timeSec: number): number {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const segment = segments[middle];
    if (!segment) break;
    if (segment.startSec <= timeSec) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

export function TranscriptPanel({ segments, currentTimeSec, onSeek }: TranscriptPanelProps) {
  const activeIndex = findActiveSegment(segments, currentTimeSec);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>("[data-active='true']");
    if (!list || !active) return;
    const isOutside =
      active.offsetTop < list.scrollTop ||
      active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight;
    if (isOutside) list.scrollTo({ top: active.offsetTop - list.clientHeight / 3 });
  }, [activeIndex]);

  if (segments.length === 0) return <p className={styles.empty}>{copy.transcript.empty}</p>;

  return (
    <ol ref={listRef} className={styles.list} aria-label={copy.transcript.title}>
      {segments.map((segment, index) => (
        <li key={segment.id}>
          <button
            type="button"
            className={styles.segment}
            data-active={index === activeIndex}
            onClick={() => onSeek(segment.startSec)}
          >
            <span className={styles.time}>{formatDuration(segment.startSec)}</span>
            <span className={styles.text}>{segment.text}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
