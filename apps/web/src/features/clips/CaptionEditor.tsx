import type { Caption } from "@clipper/shared";
import { copy } from "../../lib/copy.ts";
import { formatTimestamp } from "../../lib/format.ts";
import styles from "./CaptionEditor.module.css";

type CaptionEditorProps = {
  captions: readonly Caption[];
  isDisabled: boolean;
  onChange: (captions: Caption[]) => void;
};

/** Inline caption text editing; timings come from the transcript and stay fixed. */
export function CaptionEditor({ captions, isDisabled, onChange }: CaptionEditorProps) {
  if (captions.length === 0) return <p className={styles.empty}>{copy.clipEditor.noCaptions}</p>;

  return (
    <ol className={styles.list}>
      {captions.map((caption, index) => {
        const id = `caption-${index}`;
        return (
          // Captions have no id; their timings are unique within a clip and never reorder.
          <li key={`${caption.startSec}-${caption.endSec}`} className={styles.item}>
            <label htmlFor={id} className={styles.time}>
              {formatTimestamp(caption.startSec)}
            </label>
            <textarea
              id={id}
              className={styles.text}
              rows={2}
              value={caption.text}
              disabled={isDisabled}
              onChange={(event) =>
                onChange(
                  captions.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, text: event.target.value } : item,
                  ),
                )
              }
            />
          </li>
        );
      })}
    </ol>
  );
}
