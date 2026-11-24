import type { JobSummary } from "@clipper/shared";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/ui/StatusBadge.tsx";
import { copy } from "../../lib/copy.ts";
import { formatDateTime, formatDuration } from "../../lib/format.ts";
import styles from "./JobList.module.css";
import { jobStatusTone } from "./status-tone.ts";

type JobListProps = {
  jobs: readonly JobSummary[];
};

export function jobDisplayTitle(job: Pick<JobSummary, "title" | "source">): string {
  if (job.title) return job.title;
  return job.source.kind === "url" ? job.source.url : job.source.originalName;
}

export function JobList({ jobs }: JobListProps) {
  if (jobs.length === 0) return <p className={styles.empty}>{copy.jobList.empty}</p>;

  return (
    <ul className={styles.list}>
      {jobs.map((job) => (
        <li key={job.id}>
          <Link to={`/jobs/${job.id}`} className={styles.row}>
            <span className={styles.title}>{jobDisplayTitle(job)}</span>
            <span className={styles.meta}>
              {job.durationSec !== null && (
                <span className={styles.duration}>{formatDuration(job.durationSec)}</span>
              )}
              <span className={styles.date}>{formatDateTime(job.createdAt)}</span>
              <StatusBadge tone={jobStatusTone[job.status]} label={copy.jobStatus[job.status]} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
