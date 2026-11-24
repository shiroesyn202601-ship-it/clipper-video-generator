import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Tabs.module.css";

export type TabItem<T extends string> = {
  id: T;
  label: string;
  badge?: string;
  content: ReactNode;
};

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  label: string;
};

/** WAI-ARIA tabs: arrow keys move between tabs, only the active tab is in the tab order. */
export function Tabs<T extends string>({ items, activeId, onChange, label }: TabsProps<T>) {
  const baseId = useId();
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = items.findIndex((item) => item.id === activeId);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0 || index < 0) return;
    event.preventDefault();
    const next = items[(index + delta + items.length) % items.length];
    if (!next) return;
    onChange(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              ref={(element) => {
                if (element) tabRefs.current.set(item.id, element);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isActive ? 0 : -1}
              className={styles.tab}
              onClick={() => onChange(item.id)}
              onKeyDown={handleKeyDown}
            >
              {item.label}
              {item.badge && <span className={styles.badge}>{item.badge}</span>}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== activeId}
          className={styles.panel}
        >
          {item.id === activeId && item.content}
        </div>
      ))}
    </div>
  );
}
