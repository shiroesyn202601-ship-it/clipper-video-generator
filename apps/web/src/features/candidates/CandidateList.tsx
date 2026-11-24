import type { ClipCandidate } from "@clipper/shared";
import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { copy } from "../../lib/copy.ts";
import { formatDuration } from "../../lib/format.ts";
import styles from "./CandidateList.module.css";

type CandidateListProps = {
  candidates: readonly ClipCandidate[];
  previewingId: string | null;
  onPreview: (candidate: ClipCandidate) => void;
  /** Rendered per card, e.g. the "make clip" action. */
  renderActions?: (candidate: ClipCandidate) => ReactNode;
};

export function CandidateList({
  candidates,
  previewingId,
  onPreview,
  renderActions,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return <p className={styles.empty}>{copy.candidates.empty}</p>;
  }

  return (
    <ol className={styles.list}>
      {candidates.map((candidate, index) => {
        const duration = candidate.endSec - candidate.startSec;
        const isPreviewing = previewingId === candidate.id;
        return (
          <li key={candidate.id} className={styles.card} data-previewing={isPreviewing}>
            <div className={styles.head}>
              <span className={styles.rank}>#{index + 1}</span>
              <span className={styles.range}>
                {formatDuration(candidate.startSec)}–{formatDuration(candidate.endSec)}
                <span className={styles.duration}>
                  {" · "}
                  {copy.candidates.duration(Math.round(duration))}
                </span>
              </span>
              <span className={styles.score} title={copy.candidates.scoreHint}>
                {Math.round(candidate.score)}
                <span className="visually-hidden"> {copy.candidates.scoreLabel}</span>
              </span>
            </div>
            <p className={styles.text}>{candidate.text}</p>
            {candidate.reasons.length > 0 && (
              <ul className={styles.reasons} aria-label={copy.candidates.reasonsLabel}>
                {candidate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => onPreview(candidate)}>
                {isPreviewing ? copy.candidates.previewing : copy.candidates.preview}
              </Button>
              {renderActions?.(candidate)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
