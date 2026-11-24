import { useId, useState, type DragEvent } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { copy } from "../../lib/copy.ts";
import styles from "./FileDrop.module.css";

const ACCEPT = ".mp4,.mkv,.mov,.m4v,.webm,video/*";

type FileDropProps = {
  file: File | null;
  onChange: (file: File | null) => void;
  isDisabled: boolean;
};

export function FileDrop({ file, onChange, isDisabled }: FileDropProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !isDisabled) onChange(dropped);
  };

  return (
    <div className={styles.wrap}>
      <label
        htmlFor={inputId}
        className={styles.drop}
        data-dragging={isDragging || undefined}
        data-disabled={isDisabled || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span className={styles.title}>
          {file ? copy.newJob.fileSelected(file.name) : copy.newJob.fileLabel}
        </span>
        <span className={file ? styles.ready : styles.hint}>
          {file ? copy.newJob.fileReady : copy.newJob.fileHint}
        </span>
      </label>
      <input
        id={inputId}
        className="visually-hidden"
        type="file"
        accept={ACCEPT}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {file && (
        <Button type="submit" variant="primary" size="lg" isBusy={isDisabled}>
          {copy.newJob.submitUpload}
        </Button>
      )}
      {file && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange(null)}
          disabled={isDisabled}
        >
          {copy.common.cancel}
        </button>
      )}
    </div>
  );
}
