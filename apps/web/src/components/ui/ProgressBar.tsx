import styles from "./ProgressBar.module.css";

type ProgressBarProps = {
  /** 0..1 */
  value: number;
  label: string;
  tone?: "accent" | "success" | "danger" | "muted";
};

export function ProgressBar({ value, label, tone = "accent" }: ProgressBarProps) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={styles.track}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className={`${styles.fill} ${styles[tone]}`}
        style={{ transform: `scaleX(${percent / 100})` }}
      />
    </div>
  );
}
