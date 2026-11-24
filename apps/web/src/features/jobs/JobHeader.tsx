import type { Job } from "@clipper/shared";
import { useState } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { StatusBadge } from "../../components/ui/StatusBadge.tsx";
import { errorText } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { formatDateTime, formatDuration } from "../../lib/format.ts";
import { jobDisplayTitle } from "./JobList.tsx";
import styles from "./JobHeader.module.css";
import { useDeleteJob, useJobAction } from "./job-queries.ts";
import { jobStatusTone } from "./status-tone.ts";

type JobHeaderProps = {
  job: Job;
  onDeleted: () => void;
};

export function JobHeader({ job, onDeleted }: JobHeaderProps) {
  const cancel = useJobAction("cancel");
  const retry = useJobAction("retry");
  const remove = useDeleteJob();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isActive = job.status === "queued" || job.status === "analyzing";
  const canRetry = job.status === "failed" || job.status === "cancelled";
  const actionError = cancel.error ?? retry.error ?? remove.error;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{jobDisplayTitle(job)}</h1>
            <StatusBadge tone={jobStatusTone[job.status]} label={copy.jobStatus[job.status]} />
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>{copy.job.source}</dt>
              <dd>
                {job.source.kind === "url" ? (
                  <a href={job.source.url} target="_blank" rel="noreferrer noopener">
                    {new URL(job.source.url).hostname}
                  </a>
                ) : (
                  job.source.originalName
                )}
              </dd>
            </div>
            {job.durationSec !== null && (
              <div>
                <dt>{copy.job.duration}</dt>
                <dd className={styles.num}>{formatDuration(job.durationSec)}</dd>
              </div>
            )}
            <div>
              <dt>{copy.job.created}</dt>
              <dd className={styles.num}>{formatDateTime(job.createdAt)}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.actions}>
          {isActive && (
            <Button onClick={() => cancel.mutate(job.id)} isBusy={cancel.isPending}>
              {copy.job.cancel}
            </Button>
          )}
          {canRetry && (
            <Button variant="primary" onClick={() => retry.mutate(job.id)} isBusy={retry.isPending}>
              {copy.job.retry}
            </Button>
          )}
          <Button variant="danger" onClick={() => setIsConfirmingDelete(true)}>
            {copy.job.delete}
          </Button>
        </div>
      </header>

      {actionError && (
        <p className={styles.errorBox} role="alert">
          {errorText(actionError)}
        </p>
      )}
      {job.error && (
        <p className={styles.errorBox} role="alert">
          {job.error.userMessage}
        </p>
      )}

      <ConfirmDialog
        isOpen={isConfirmingDelete}
        title={copy.job.deleteTitle}
        body={copy.job.deleteBody}
        confirmLabel={copy.job.deleteConfirm}
        isBusy={remove.isPending}
        onClose={() => setIsConfirmingDelete(false)}
        onConfirm={() =>
          remove.mutate(job.id, {
            onSuccess: () => {
              setIsConfirmingDelete(false);
              onDeleted();
            },
          })
        }
      />
    </>
  );
}
