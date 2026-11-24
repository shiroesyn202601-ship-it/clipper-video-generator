import { DEFAULT_JOB_SETTINGS, type JobSettings } from "@clipper/shared";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.tsx";
import { errorText } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { useCreateJob } from "./job-queries.ts";
import styles from "./NewJobForm.module.css";
import { SettingsFields } from "./SettingsFields.tsx";

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function NewJobForm() {
  const navigate = useNavigate();
  const createJob = useCreateJob();
  const [url, setUrl] = useState("");
  const [settings, setSettings] = useState<JobSettings>({ ...DEFAULT_JOB_SETTINGS });
  const [validationError, setValidationError] = useState<string | null>(null);
  const urlId = useId();
  const hintId = useId();
  const errorId = useId();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!URL_PATTERN.test(trimmed)) {
      setValidationError(copy.newJob.invalidUrl);
      return;
    }
    setValidationError(null);
    createJob.mutate(
      { url: trimmed, settings },
      {
        onSuccess: (job) => {
          navigate(`/jobs/${job.id}`);
        },
      },
    );
  };

  const errorMessage = validationError ?? (createJob.isError ? errorText(createJob.error) : null);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <label htmlFor={urlId} className={styles.label}>
        {copy.newJob.urlLabel}
      </label>
      <div className={styles.row}>
        <input
          id={urlId}
          className={styles.input}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={copy.newJob.urlPlaceholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-describedby={errorMessage ? `${hintId} ${errorId}` : hintId}
          aria-invalid={validationError !== null}
        />
        <Button type="submit" variant="primary" size="lg" isBusy={createJob.isPending}>
          {copy.newJob.submit}
        </Button>
      </div>
      <p id={hintId} className={styles.hint}>
        {copy.newJob.urlHint}
      </p>
      {errorMessage && (
        <p id={errorId} className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}

      <details className={styles.advanced}>
        <summary className={styles.summary}>{copy.newJob.advanced}</summary>
        <div className={styles.advancedBody}>
          <SettingsFields value={settings} onChange={setSettings} />
        </div>
      </details>
    </form>
  );
}
