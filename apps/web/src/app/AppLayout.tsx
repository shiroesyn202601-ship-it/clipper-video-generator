import { Link, NavLink, Outlet } from "react-router-dom";
import { HealthBanner } from "../features/health/HealthBanner.tsx";
import { copy } from "../lib/copy.ts";
import styles from "./AppLayout.module.css";

const navClass = ({ isActive }: { isActive: boolean }): string =>
  `${styles.navLink ?? ""} ${isActive ? (styles.navLinkActive ?? "") : ""}`;

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
        <nav className={styles.nav} aria-label="Navigasi utama">
          <NavLink to="/" end className={navClass}>
            {copy.nav.newJob}
          </NavLink>
          <NavLink to="/brand" className={navClass}>
            {copy.nav.brand}
          </NavLink>
          <NavLink to="/tools" className={navClass}>
            {copy.nav.tools}
          </NavLink>
        </nav>
      </header>
      <main className={styles.main}>
        <HealthBanner />
        <Outlet />
      </main>
    </div>
  );
}
