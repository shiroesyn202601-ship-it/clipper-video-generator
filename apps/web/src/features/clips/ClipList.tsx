import { clipStatus, type Clip } from "@clipper/shared";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/ui/StatusBadge.tsx";
import { copy } from "../../lib/copy.ts";
import { formatDuration } from "../../lib/format.ts";
import styles from "./ClipList.module.css";
import { clipStatusTone } from "./clip-status.ts";

type ClipListProps = {
  jobId: string;
  clips: readonly Clip[];
};

export function ClipList({ jobId, clips }: ClipListProps) {
  if (clips.length === 0) return <p className={styles.empty}>{copy.clips.empty}</p>;

  return (
    <ol className={styles.list}>
      {clips.map((clip, index) => {
        const status = clipStatus(clip);
        return (
          <li key={clip.id}>
            <Link to={`/jobs/${jobId}/clips/${clip.id}`} className={styles.row}>
              <span className={styles.name}>{copy.clips.name(index + 1)}</span>
              <span className={styles.range}>
                {formatDuration(clip.startSec)}–{formatDuration(clip.endSec)}
              </span>
              <StatusBadge tone={clipStatusTone[status]} label={copy.clipStatus[status]} />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
