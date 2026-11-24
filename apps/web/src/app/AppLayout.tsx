import { Link, Outlet } from "react-router-dom";
import { HealthBanner } from "../features/health/HealthBanner.tsx";
import { copy } from "../lib/copy.ts";
import styles from "./AppLayout.module.css";

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}>
          <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
            <rect
              x="11"
              y="5"
              width="10"
              height="22"
              rx="2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            />
            <path d="M14.5 13v6l5-3z" fill="currentColor" />
          </svg>
          <span>{copy.appName}</span>
        </Link>
      </header>
      <main className={styles.main}>
        <HealthBanner />
        <Outlet />
      </main>
    </div>
  );
}
