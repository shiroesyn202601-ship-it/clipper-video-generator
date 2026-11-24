import { Button } from "../components/ui/Button.tsx";
import { ToolList } from "../features/health/ToolList.tsx";
import { useHealth } from "../features/health/use-health.ts";
import { errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import styles from "./ToolsPage.module.css";

export function ToolsPage() {
  const health = useHealth();

  return (
    <section className={styles.page} aria-labelledby="tools-title">
      <div className={styles.head}>
        <div>
          <h1 id="tools-title" className={styles.title}>
            {copy.health.title}
          </h1>
          <p className={styles.intro}>{copy.health.intro}</p>
        </div>
        <Button onClick={() => void health.refetch()} isBusy={health.isFetching}>
          {copy.health.recheck}
        </Button>
      </div>
      {health.isPending && <p className={styles.intro}>{copy.common.loading}</p>}
      {health.isError && <p role="alert">{errorText(health.error)}</p>}
      {health.data && <ToolList tools={health.data.tools} />}
    </section>
  );
}
