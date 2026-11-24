import type { ToolStatus } from "@clipper/shared";
import { copy } from "../../lib/copy.ts";
import styles from "./ToolList.module.css";

type ToolListProps = {
  tools: readonly ToolStatus[];
};

export function ToolList({ tools }: ToolListProps) {
  return (
    <ul className={styles.list}>
      {tools.map((tool) => (
        <li key={tool.id} className={styles.item}>
          <span className={styles.label}>{tool.label}</span>
          <span className={tool.isAvailable ? styles.ok : styles.missing}>
            {tool.isAvailable ? copy.health.available : copy.health.missing}
          </span>
          <span className={styles.meta}>
            {tool.isAvailable
              ? (tool.version ?? tool.detail ?? copy.health.available)
              : (tool.detail ?? copy.health.missing)}
          </span>
        </li>
      ))}
    </ul>
  );
}
