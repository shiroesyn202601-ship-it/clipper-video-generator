import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "lg";
  isBusy?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  isBusy = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      disabled={disabled === true || isBusy}
      aria-busy={isBusy || undefined}
    >
      {isBusy ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
