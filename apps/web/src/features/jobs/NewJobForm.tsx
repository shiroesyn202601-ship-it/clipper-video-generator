import { DEFAULT_JOB_SETTINGS, type JobSettings } from "@clipper/shared";
import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button.tsx";
import { Icon } from "../../components/ui/Icon.tsx";
import { ProgressBar } from "../../components/ui/ProgressBar.tsx";
import { errorText } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { toPercent } from "../../lib/format.ts";
import { requestNotificationPermission } from "../../lib/notify.ts";
import { useCreateJob, useUploadJob } from "./job-queries.ts";
import styles from "./NewJobForm.module.css";
import { SettingsFields } from "./SettingsFields.tsx";

const URL_PATTERN = /^https?:\/\/\S+$/i;
const ACCEPT = ".mp4,.mkv,.mov,.m4v,.webm,video/*";

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.max(mb, 0.1).toFixed(1)} MB`;
}

export function NewJobForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [settings, setSettings] = useState<JobSettings>({ ...DEFAULT_JOB_SETTINGS });
  const [validationError, setValidationError] = useState<string | null>(null);
  const createJob = useCreateJob();
  const uploadJob = useUploadJob(setUploadProgress);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlId = useId();
  const hintId = useId();
  const errorId = useId();
  const advancedId = useId();

  const isBusy = createJob.isPending || uploadJob.isPending;

  const chooseFile = (next: File | null): void => {
    setFile(next);
    setValidationError(null);
    if (!next && fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    // Asked here because browsers only show the prompt after a user action.
    requestNotificationPermission();
    const openJob = (jobId: string): void => navigate(`/jobs/${jobId}`);
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

  const handleDragOver = (event: DragEvent<HTMLFormElement>): void => {
    if (isBusy || !event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLFormElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !isBusy) chooseFile(dropped);
  };

  const mutationError = createJob.error ?? uploadJob.error;
  const errorMessage = validationError ?? (mutationError ? errorText(mutationError) : null);

  return (
    <form
      className={styles.form}
      onSubmit={handleSubmit}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dragging={isDragging || undefined}
      noValidate
    >
      <div className={styles.row}>
        <div className={styles.field} data-invalid={validationError !== null || undefined}>
          {file ? (
            <div className={styles.fileChip}>
              <span className={styles.fieldIcon}>
                <Icon name="film" size={18} />
              </span>
              <span className={styles.fileName} title={file.name}>
                {file.name}
              </span>
              <span className={styles.fileSize}>{formatSize(file.size)}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => chooseFile(null)}
                disabled={isBusy}
                aria-label={copy.newJob.clearFile}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ) : (
            <>
              <label htmlFor={urlId} className={styles.fieldIcon}>
                <Icon name="link" size={18} />
                <span className="visually-hidden">{copy.newJob.urlLabel}</span>
              </label>
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
              <button
                type="button"
                className={styles.pickButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                <Icon name="folder" size={16} />
                <span>{copy.newJob.pickFile}</span>
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept={ACCEPT}
            tabIndex={-1}
            aria-hidden="true"
            disabled={isBusy}
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" variant="primary" size="lg" isBusy={isBusy}>
          {file ? copy.newJob.submitUpload : copy.newJob.submit}
        </Button>
      </div>

      <div className={styles.meta}>
        <p id={hintId} className={styles.hint}>
          {isDragging ? copy.newJob.dropHint : copy.newJob.sourceHint}
        </p>
        <button
          type="button"
          className={styles.advancedToggle}
          aria-expanded={isAdvancedOpen}
          aria-controls={advancedId}
          onClick={() => setIsAdvancedOpen((open) => !open)}
        >
          <Icon name="sliders" size={16} />
          {copy.newJob.advanced}
        </button>
      </div>

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

      <div id={advancedId} className={styles.advancedBody} hidden={!isAdvancedOpen}>
        <SettingsFields value={settings} onChange={setSettings} />
      </div>
    </form>
  );
}
