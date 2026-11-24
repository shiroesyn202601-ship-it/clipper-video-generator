import { Link } from "react-router-dom";
import { copy } from "../lib/copy.ts";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  return (
    <section className={styles.page}>
      <h1>{copy.errors.notFoundTitle}</h1>
      <p>{copy.errors.notFoundBody}</p>
      <Link to="/" className={styles.link}>
        {copy.errors.backHome}
      </Link>
    </section>
  );
}
