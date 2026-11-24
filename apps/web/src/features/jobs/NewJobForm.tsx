import { DEFAULT_JOB_SETTINGS, type JobSettings } from "@clipper/shared";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.tsx";
import { ProgressBar } from "../../components/ui/ProgressBar.tsx";
import { errorText } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { toPercent } from "../../lib/format.ts";
import { FileDrop } from "./FileDrop.tsx";
import { useCreateJob, useUploadJob } from "./job-queries.ts";
import styles from "./NewJobForm.module.css";
import { SettingsFields } from "./SettingsFields.tsx";

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function NewJobForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [settings, setSettings] = useState<JobSettings>({ ...DEFAULT_JOB_SETTINGS });
  const [validationError, setValidationError] = useState<string | null>(null);
  const createJob = useCreateJob();
  const uploadJob = useUploadJob(setUploadProgress);
  const urlId = useId();
  const hintId = useId();
  const errorId = useId();

  const openJob = (jobId: string): void => {
    navigate(`/jobs/${jobId}`);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (file) {
      setValidationError(null);
      setUploadProgress(0);
      uploadJob.mutate({ file, settings }, { onSuccess: (job) => openJob(job.id) });
      return;
    }
    const trimmed = url.trim();
    if (!URL_PATTERN.test(trimmed)) {
      setValidationError(copy.newJob.invalidUrl);
      return;
    }
    setValidationError(null);
    createJob.mutate({ url: trimmed, settings }, { onSuccess: (job) => openJob(job.id) });
  };

  const mutationError = createJob.error ?? uploadJob.error;
  const errorMessage = validationError ?? (mutationError ? errorText(mutationError) : null);
  const isBusy = createJob.isPending || uploadJob.isPending;

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
          disabled={file !== null}
          onChange={(event) => setUrl(event.target.value)}
          aria-describedby={errorMessage ? `${hintId} ${errorId}` : hintId}
          aria-invalid={validationError !== null}
        />
        <Button type="submit" variant="primary" size="lg" isBusy={isBusy}>
          {file ? copy.newJob.submitUpload : copy.newJob.submit}
        </Button>
      </div>
      <p id={hintId} className={styles.hint}>
        {copy.newJob.urlHint}
      </p>

      <div className={styles.divider} aria-hidden="true">
        <span>{copy.newJob.or}</span>
      </div>
      <FileDrop file={file} onChange={setFile} isDisabled={isBusy} />

      {uploadJob.isPending && (
        <div className={styles.upload}>
          <span className={styles.uploadLabel}>
            {copy.newJob.uploading(toPercent(uploadProgress))}
          </span>
          <ProgressBar
            value={uploadProgress}
            label={copy.newJob.uploading(toPercent(uploadProgress))}
          />
        </div>
      )}

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
