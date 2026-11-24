import {
  COMMENTARY_LIMITS,
  COMMENTARY_VOICES,
  type ClipCommentary,
  type CommentaryVoice,
} from "@clipper/shared";
import { useId, useState } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { copy } from "../../lib/copy.ts";
import styles from "./CommentaryEditor.module.css";

type CommentaryEditorProps = {
  value: ClipCommentary | null;
  isDisabled: boolean;
  isGenerating: boolean;
  onChange: (next: ClipCommentary) => void;
  onGenerate: (persona: string) => void;
};

const VOICES = Object.entries(COMMENTARY_VOICES) as [CommentaryVoice, string][];
const text = copy.commentary;

/** AI creator commentary of one clip: generate with Groq, then edit text and voice. */
export function CommentaryEditor({
  value,
  isDisabled,
  isGenerating,
  onChange,
  onGenerate,
}: CommentaryEditorProps) {
  const [persona, setPersona] = useState("");
  const idPrefix = useId();

  return (
    <div className={styles.editor}>
      <p className={styles.intro}>{text.intro}</p>
      <div className={styles.generateRow}>
        <label className={styles.field}>
          <span className={styles.label}>{text.persona}</span>
          <input
            className={styles.control}
            value={persona}
            maxLength={200}
            placeholder={text.personaPlaceholder}
            disabled={isDisabled}
            onChange={(event) => setPersona(event.target.value)}
          />
        </label>
        <Button onClick={() => onGenerate(persona)} isBusy={isGenerating} disabled={isDisabled}>
          {value ? text.regenerate : text.generate}
        </Button>
      </div>

      {value && (
        <fieldset className={styles.fields} disabled={isDisabled}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
            />
            <span>{text.enabled}</span>
          </label>
          {(
            [
              ["intro", text.introLabel, COMMENTARY_LIMITS.introMaxChars],
              ["outro", text.outroLabel, COMMENTARY_LIMITS.outroMaxChars],
            ] as const
          ).map(([key, label, max]) => (
            <div key={key} className={styles.field}>
              <span className={styles.labelRow}>
                <label htmlFor={`${idPrefix}-${key}`} className={styles.label}>
                  {label}
                </label>
                <span className={styles.counter}>{text.counter(value[key].length, max)}</span>
              </span>
              <textarea
                id={`${idPrefix}-${key}`}
                className={styles.textarea}
                rows={key === "intro" ? 2 : 3}
                maxLength={max}
                value={value[key]}
                onChange={(event) => onChange({ ...value, [key]: event.target.value })}
              />
            </div>
          ))}
          <label className={styles.field}>
            <span className={styles.label}>{text.voice}</span>
            <select
              className={styles.control}
              value={value.voice}
              onChange={(event) =>
                onChange({ ...value, voice: event.target.value as CommentaryVoice })
              }
            >
              {VOICES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
    </div>
  );
}
