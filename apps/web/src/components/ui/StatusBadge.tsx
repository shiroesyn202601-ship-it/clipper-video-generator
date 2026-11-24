import styles from "./StatusBadge.module.css";

export type Tone = "neutral" | "active" | "success" | "danger" | "warning";

type StatusBadgeProps = {
  tone: Tone;
  label: string;
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {tone === "active" && <span className={styles.dot} aria-hidden="true" />}
      {label}
    </span>
  );
}
