import { ToolList } from "../features/health/ToolList.tsx";
import { useHealth } from "../features/health/use-health.ts";
import { errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import styles from "./HomePage.module.css";

export function HomePage() {
  const health = useHealth();

  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{copy.health.title}</h1>
      {health.isPending && <p className={styles.muted}>{copy.common.loading}</p>}
      {health.isError && <p role="alert">{errorText(health.error)}</p>}
      {health.data && <ToolList tools={health.data.tools} />}
    </section>
  );
}
