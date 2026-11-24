import { useState } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { copy } from "../../lib/copy.ts";
import styles from "./HealthBanner.module.css";
import { ToolList } from "./ToolList.tsx";
import { useHealth } from "./use-health.ts";

/** Warns when any external tool is missing; renders nothing when everything is ready. */
export function HealthBanner() {
  const health = useHealth();
  const [isExpanded, setIsExpanded] = useState(false);

  if (!health.data || health.data.isReady) return null;
  const missingCount = health.data.tools.filter((tool) => !tool.isAvailable).length;

  return (
    <section className={styles.banner} aria-labelledby="health-banner-title">
      <div className={styles.row}>
        <div>
          <h2 id="health-banner-title" className={styles.title}>
            {copy.health.missingTitle(missingCount)}
          </h2>
          <p className={styles.body}>{copy.health.missingBody}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => void health.refetch()} isBusy={health.isFetching}>
            {copy.health.recheck}
          </Button>
          <Button
            variant="secondary"
            aria-expanded={isExpanded}
            aria-controls="health-banner-tools"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded ? copy.health.hideDetails : copy.health.showDetails}
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div id="health-banner-tools" className={styles.details}>
          <ToolList tools={health.data.tools} />
        </div>
      )}
    </section>
  );
}
