import { Button } from "../components/ui/Button.tsx";
import { JobList } from "../features/jobs/JobList.tsx";
import { NewJobForm } from "../features/jobs/NewJobForm.tsx";
import { useJobs } from "../features/jobs/job-queries.ts";
import { errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import styles from "./HomePage.module.css";

export function HomePage() {
  const jobs = useJobs();

  return (
    <div className={styles.page}>
      <section className={styles.section} aria-labelledby="new-job-title">
        <h1 id="new-job-title" className={styles.title}>
          {copy.newJob.title}
        </h1>
        <NewJobForm />
      </section>

      <section className={styles.section} aria-labelledby="job-list-title">
        <h2 id="job-list-title" className={styles.subtitle}>
          {copy.jobList.title}
        </h2>
        {jobs.isPending && <div className={styles.skeleton} aria-label={copy.common.loading} />}
        {jobs.isError && (
          <div className={styles.error} role="alert">
            <p>{errorText(jobs.error)}</p>
            <Button onClick={() => void jobs.refetch()}>{copy.common.retry}</Button>
          </div>
        )}
        {jobs.data && <JobList jobs={jobs.data} />}
      </section>
    </div>
  );
}
