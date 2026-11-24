import type { StageId, StageState } from "@clipper/shared";
import type { ReactNode } from "react";
import { ProgressBar } from "../../components/ui/ProgressBar.tsx";
import { StatusBadge } from "../../components/ui/StatusBadge.tsx";
import { copy } from "../../lib/copy.ts";
import { elapsedSec, formatDuration, toPercent } from "../../lib/format.ts";
import styles from "./StageList.module.css";
import { stageStatusTone } from "./status-tone.ts";

type StageListProps = {
  stages: readonly { id: StageId; state: StageState }[];
  /** Optional per-stage control, e.g. a skip button. */
  renderAction?: (id: StageId, state: StageState) => ReactNode;
};

const progressTone = {
  pending: "muted",
  running: "accent",
  done: "success",
  skipped: "muted",
  failed: "danger",
  cancelled: "muted",
} as const;

export function StageList({ stages, renderAction }: StageListProps) {
  return (
    <ol className={styles.list}>
      {stages.map(({ id, state }) => {
        const label = copy.stageLabel[id];
        const isRunning = state.status === "running";
        return (
          <li key={id} className={styles.item} data-status={state.status}>
            <div className={styles.head}>
              <span className={styles.label}>{label}</span>
              <span className={styles.meta}>
                {isRunning && <span className={styles.percent}>{toPercent(state.progress)}%</span>}
                {state.startedAt && state.status !== "pending" && (
                  <span className={styles.time}>
                    {formatDuration(elapsedSec(state.startedAt, state.finishedAt))}
                  </span>
                )}
                {renderAction?.(id, state)}
                <StatusBadge
                  tone={stageStatusTone[state.status]}
                  label={copy.stageStatus[state.status]}
                />
              </span>
            </div>
            {(isRunning || state.status === "done") && (
              <ProgressBar
                value={state.status === "done" ? 1 : state.progress}
                label={label}
                tone={progressTone[state.status]}
              />
            )}
            {state.message && <p className={styles.message}>{state.message}</p>}
          </li>
        );
      })}
    </ol>
  );
}
