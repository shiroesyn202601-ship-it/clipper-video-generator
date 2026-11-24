import { ANALYSIS_STAGE_IDS, analysisProgress, type Job } from "@clipper/shared";
import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/Button.tsx";
import { ConfirmDialog } from "../components/ui/ConfirmDialog.tsx";
import { ProgressBar } from "../components/ui/ProgressBar.tsx";
import { StatusBadge } from "../components/ui/StatusBadge.tsx";
import { jobDisplayTitle } from "../features/jobs/JobList.tsx";
import { StageList } from "../features/jobs/StageList.tsx";
import { useDeleteJob, useJob, useJobAction, useJobEvents } from "../features/jobs/job-queries.ts";
import { jobStatusTone } from "../features/jobs/status-tone.ts";
import { errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import { formatDateTime, formatDuration, toPercent } from "../lib/format.ts";
import styles from "./JobPage.module.css";

export function JobPage() {
  const { jobId = "" } = useParams();
  const navigate = useNavigate();
  const job = useJob(jobId);
  const goHome = useCallback(() => {
    navigate("/");
  }, [navigate]);
  useJobEvents(jobId, goHome);

  if (job.isPending) return <div className={styles.skeleton} aria-label={copy.common.loading} />;
  if (job.isError) {
    return (
      <div className={styles.errorBox} role="alert">
        <p>{errorText(job.error)}</p>
        <Link to="/">{copy.errors.backHome}</Link>
      </div>
    );
  }
  return <JobView job={job.data} onDeleted={goHome} />;
}

type JobViewProps = {
  job: Job;
  onDeleted: () => void;
};

function JobView({ job, onDeleted }: JobViewProps) {
  const cancel = useJobAction("cancel");
  const retry = useJobAction("retry");
  const remove = useDeleteJob();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  const isActive = job.status === "queued" || job.status === "analyzing";
  const canRetry = job.status === "failed" || job.status === "cancelled";
  const progress = analysisProgress(job);
  const actionError = cancel.error ?? retry.error ?? remove.error;

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.back}>
        ← {copy.job.back}
      </Link>

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

      <section className={styles.section} aria-labelledby="stages-title">
        <div className={styles.sectionHead}>
          <h2 id="stages-title" className={styles.subtitle}>
            {copy.job.stagesTitle}
          </h2>
          {isActive && <span className={styles.num}>{copy.job.progress(toPercent(progress))}</span>}
        </div>
        {isActive && <ProgressBar value={progress} label={copy.job.stagesTitle} />}
        <StageList stages={ANALYSIS_STAGE_IDS.map((id) => ({ id, state: job.stages[id] }))} />
      </section>

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
    </div>
  );
}
