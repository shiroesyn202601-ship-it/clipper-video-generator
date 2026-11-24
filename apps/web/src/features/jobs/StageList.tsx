import type { StageId, StageState } from "@clipper/shared";
import { useEffect, useState, type ReactNode } from "react";
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

/**
 * Elapsed time of one stage. Server updates arrive only when progress changes,
 * so a running stage ticks on its own clock every second like a stopwatch.
 */
function StageElapsed({
  startedAt,
  finishedAt,
  isRunning,
}: {
  startedAt: string;
  finishedAt: string | null;
  isRunning: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);
  const seconds = elapsedSec(startedAt, isRunning ? null : finishedAt, nowMs);
  return <span className={styles.time}>{formatDuration(seconds)}</span>;
}

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
                  <StageElapsed
                    startedAt={state.startedAt}
                    finishedAt={state.finishedAt}
                    isRunning={isRunning}
                  />
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
