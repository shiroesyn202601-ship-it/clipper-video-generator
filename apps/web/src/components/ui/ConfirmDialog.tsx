import { useEffect, useRef } from "react";
import { copy } from "../../lib/copy.ts";
import { Button } from "./Button.tsx";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  isBusy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Native <dialog>: focus trap, Escape to close and inert background come for free. */
export function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  isBusy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onClose={onClose}
    >
      <h2 id="confirm-title" className={styles.title}>
        {title}
      </h2>
      <p id="confirm-body" className={styles.body}>
        {body}
      </p>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          {copy.common.cancel}
        </Button>
        <Button variant="danger" onClick={onConfirm} isBusy={isBusy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
