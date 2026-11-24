import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  /** 0..1 */
  value: number;
  label: string;
  tone?: "accent" | "success" | "danger" | "muted";
  /** Shows a moving sheen so ongoing work reads as alive. Defaults to on for unfinished accent bars. */
  isActive?: boolean;
};

export function ProgressBar({ value, label, tone = "accent", isActive }: ProgressBarProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const animated = isActive ?? (tone === "accent" && percent < 100);
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-busy={animated || undefined}
    >
      <div
        className={`${styles.fill} ${styles[tone]}`}
        style={{ transform: `scaleX(${percent / 100})` }}
      />
      {animated && <div className={styles.sheen} aria-hidden="true" />}
    </div>
  );
}
