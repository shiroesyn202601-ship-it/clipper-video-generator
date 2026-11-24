import { CLIP_LIMITS, type JobSettings } from "@clipper/shared";
import { copy } from "../../lib/copy.ts";
import styles from "./SettingsFields.module.css";

type SettingsFieldsProps = {
  value: JobSettings;
  onChange: (next: JobSettings) => void;
};

export function SettingsFields({ value, onChange }: SettingsFieldsProps) {
  const set = <K extends keyof JobSettings>(key: K, fieldValue: JobSettings[K]): void => {
    onChange({ ...value, [key]: fieldValue });
  };
  const musicPercent = Math.round(value.musicVolume * 100);

  return (
    <div className={styles.grid}>
      <label className={styles.field}>
        <span className={styles.label}>{copy.newJob.language}</span>
        <select
          className={styles.control}
          value={value.language}
          onChange={(event) => set("language", event.target.value as JobSettings["language"])}
        >
          {(["id", "en", "auto"] as const).map((language) => (
            <option key={language} value={language}>
              {copy.newJob.languages[language]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>{copy.newJob.clipLength}</legend>
        <div className={styles.triple}>
          {(
            [
              ["minClipSec", copy.newJob.minClip],
              ["targetClipSec", copy.newJob.targetClip],
              ["maxClipSec", copy.newJob.maxClip],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className={styles.small}>
              <span className={styles.subLabel}>{label}</span>
              <input
                className={`${styles.control} ${styles.number}`}
                type="number"
                inputMode="numeric"
                min={CLIP_LIMITS.minClipSec}
                max={CLIP_LIMITS.maxClipSec}
                value={value[key]}
                onChange={(event) => set(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>{copy.newJob.maxCandidates}</span>
        <input
          className={`${styles.control} ${styles.number}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={CLIP_LIMITS.maxCandidates}
          value={value.maxCandidates}
          onChange={(event) => set("maxCandidates", Number(event.target.value))}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>{copy.newJob.subtitleStyle}</span>
        <select
          className={styles.control}
          value={value.subtitleStyle}
          onChange={(event) =>
            set("subtitleStyle", event.target.value as JobSettings["subtitleStyle"])
          }
        >
          {(["bold-center", "lower-third"] as const).map((style) => (
            <option key={style} value={style}>
              {copy.newJob.subtitleStyles[style]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.labelRow}>
          <span className={styles.label}>{copy.newJob.musicVolume}</span>
          <span className={styles.value}>{copy.newJob.musicVolumeValue(musicPercent)}</span>
        </span>
        <input
          type="range"
          aria-label={copy.newJob.musicVolume}
          aria-valuetext={copy.newJob.musicVolumeValue(musicPercent)}
          min={0}
          max={100}
          step={5}
          value={musicPercent}
          onChange={(event) => set("musicVolume", Number(event.target.value) / 100)}
        />
      </label>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.separateVocals}
          onChange={(event) => set("separateVocals", event.target.checked)}
        />
        <span>{copy.newJob.separateVocals}</span>
      </label>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.denoise}
          onChange={(event) => set("denoise", event.target.checked)}
        />
        <span>{copy.newJob.denoise}</span>
      </label>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={value.onlineTranscribe}
          onChange={(event) => set("onlineTranscribe", event.target.checked)}
        />
        <span>{copy.newJob.onlineTranscribe}</span>
      </label>
    </div>
  );
}
