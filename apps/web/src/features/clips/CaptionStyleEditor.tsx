import {
  CAPTION_ANIMATIONS,
  CAPTION_FONTS,
  CAPTION_PRESETS,
  HIGHLIGHT_MODES,
  type CaptionFont,
  type CaptionPresetId,
  type CaptionStyle,
} from "@clipper/shared";
import { useEffect, useId, type CSSProperties, type ReactNode } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { api } from "../../lib/api.ts";
import { copy } from "../../lib/copy.ts";
import { useCaptionFonts } from "../settings/settings-queries.ts";
import styles from "./CaptionStyleEditor.module.css";

type CaptionStyleEditorProps = {
  /** null = legacy look from the job settings. */
  value: CaptionStyle | null;
  isDisabled: boolean;
  isDefault: boolean;
  isSavingDefault: boolean;
  onChange: (next: CaptionStyle | null) => void;
  onSaveDefault: (style: CaptionStyle | null) => void;
};

const LEGACY = "legacy";
const CUSTOM = "custom";
const PRESET_IDS = Object.keys(CAPTION_PRESETS) as CaptionPresetId[];
const FONT_NAMES = Object.keys(CAPTION_FONTS) as CaptionFont[];
const loadedFonts = new Set<string>();

function samePreset(style: CaptionStyle): CaptionPresetId | undefined {
  return PRESET_IDS.find((id) => {
    const preset: CaptionStyle = CAPTION_PRESETS[id];
    return (Object.keys(preset) as (keyof CaptionStyle)[]).every(
      (key) => preset[key] === style[key],
    );
  });
}

/** Registers the downloaded font file with the browser so the preview uses it. */
function useFontFace(font: CaptionFont | undefined, isAvailable: boolean): void {
  useEffect(() => {
    const file = font ? CAPTION_FONTS[font] : null;
    if (!font || !file || !isAvailable || loadedFonts.has(font)) return;
    loadedFonts.add(font);
    const face = new FontFace(font, `url(${api.fontUrl(file)})`);
    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => loadedFonts.delete(font));
  }, [font, isAvailable]);
}

function hexToRgba(hex: string, opacity: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${opacity})`;
}

function Preview({ style }: { style: CaptionStyle }) {
  const words = copy.captionStyle.sample.split(" ");
  const activeIndex = 1;
  const vars = {
    "--caption-font": `"${style.font}", Arial, sans-serif`,
    "--caption-size": style.fontSize,
    "--caption-outline": style.box ? 0 : style.outlineWidth,
    "--caption-text": style.textColor,
    "--caption-outline-color": style.outlineColor,
    "--caption-top": `${style.positionY}%`,
    "--caption-box": style.box ? hexToRgba(style.boxColor, style.boxOpacity) : "transparent",
    "--caption-shadow": style.shadow && !style.box ? "0 0.12em 0.1em rgba(0, 0, 0, 0.5)" : "none",
  } as CSSProperties;
  return (
    <div className={styles.preview} role="img" aria-label={copy.captionStyle.previewLabel}>
      <p className={styles.caption} style={vars}>
        {words.map((word, index) => {
          const text = style.uppercase ? word.toLocaleUpperCase("id-ID") : word;
          const isActive =
            style.highlightMode === "karaoke" ? index <= activeIndex : index === activeIndex;
          const wordStyle: CSSProperties = {};
          if (isActive && style.highlightMode !== "none") {
            if (style.highlightMode === "pill" && !style.box) {
              wordStyle.background = style.highlightColor;
            } else {
              wordStyle.color = style.highlightColor;
            }
          }
          return (
            <span
              key={word}
              className={
                isActive && style.highlightMode === "pill" && !style.box ? styles.pill : undefined
              }
              style={wordStyle}
            >
              {text}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** Slider with its label and current value on one row above it. */
function RangeField(props: {
  label: string;
  display: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <span className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {props.label}
        </label>
        <span className={styles.value}>{props.display}</span>
      </span>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

/** Preset picker plus detailed controls for the burned-in captions of one clip. */
export function CaptionStyleEditor({
  value,
  isDisabled,
  isDefault,
  isSavingDefault,
  onChange,
  onSaveDefault,
}: CaptionStyleEditorProps) {
  const fonts = useCaptionFonts();
  const text = copy.captionStyle;
  useFontFace(value?.font, value ? fonts.data?.[value.font] !== false : false);
  const presetId = value ? (samePreset(value) ?? CUSTOM) : LEGACY;

  const set = <K extends keyof CaptionStyle>(key: K, fieldValue: CaptionStyle[K]): void => {
    if (value) onChange({ ...value, [key]: fieldValue });
  };

  const choosePreset = (id: string): void => {
    if (id === LEGACY) onChange(null);
    else if (id !== CUSTOM) onChange({ ...CAPTION_PRESETS[id as CaptionPresetId] });
  };

  return (
    <div className={styles.editor}>
      <label className={styles.field}>
        <span className={styles.label}>{text.preset}</span>
        <select
          className={styles.control}
          value={presetId}
          disabled={isDisabled}
          onChange={(event) => choosePreset(event.target.value)}
        >
          <option value={LEGACY}>{text.legacy}</option>
          {PRESET_IDS.map((id) => (
            <option key={id} value={id}>
              {text.presets[id]}
            </option>
          ))}
          {presetId === CUSTOM && <option value={CUSTOM}>{text.custom}</option>}
        </select>
      </label>

      {value && (
        <div className={styles.body}>
          <Preview style={value} />
          <fieldset className={styles.fields} disabled={isDisabled}>
            <label className={styles.field}>
              <span className={styles.label}>{text.font}</span>
              <select
                className={styles.control}
                value={value.font}
                onChange={(event) => set("font", event.target.value as CaptionFont)}
              >
                {FONT_NAMES.map((font) => (
                  <option key={font} value={font}>
                    {fonts.data?.[font] === false ? `${font} ${text.fontMissing}` : font}
                  </option>
                ))}
              </select>
            </label>

            <RangeField
              label={text.fontSize}
              display={value.fontSize}
              min={32}
              max={160}
              step={2}
              value={value.fontSize}
              onChange={(next) => set("fontSize", next)}
            />

            <label className={styles.field}>
              <span className={styles.label}>{text.highlightMode}</span>
              <select
                className={styles.control}
                value={value.highlightMode}
                onChange={(event) =>
                  set("highlightMode", event.target.value as CaptionStyle["highlightMode"])
                }
              >
                {HIGHLIGHT_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {text.highlightModes[mode]}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>{text.animation}</span>
              <select
                className={styles.control}
                value={value.animation}
                onChange={(event) =>
                  set("animation", event.target.value as CaptionStyle["animation"])
                }
              >
                {CAPTION_ANIMATIONS.map((animation) => (
                  <option key={animation} value={animation}>
                    {text.animations[animation]}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.colors}>
              {(
                [
                  ["textColor", text.textColor],
                  ["highlightColor", text.highlightColor],
                  ["outlineColor", text.outlineColor],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={styles.color}>
                  <input
                    type="color"
                    value={value[key]}
                    onChange={(event) => set(key, event.target.value.toUpperCase())}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <RangeField
              label={text.outlineWidth}
              display={value.outlineWidth}
              min={0}
              max={16}
              step={1}
              value={value.outlineWidth}
              onChange={(next) => set("outlineWidth", next)}
            />

            <RangeField
              label={text.positionY}
              display={text.positionValue(value.positionY)}
              min={10}
              max={90}
              step={1}
              value={value.positionY}
              onChange={(next) => set("positionY", next)}
            />

            <div className={styles.checks}>
              {(
                [
                  ["uppercase", text.uppercase],
                  ["shadow", text.shadow],
                  ["box", text.box],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={value[key]}
                    onChange={(event) => set(key, event.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {value.box && (
              <div className={styles.boxRow}>
                <label className={styles.color}>
                  <input
                    type="color"
                    value={value.boxColor}
                    onChange={(event) => set("boxColor", event.target.value.toUpperCase())}
                  />
                  <span>{text.boxColor}</span>
                </label>
                <RangeField
                  label={text.boxOpacity}
                  display={`${Math.round(value.boxOpacity * 100)}%`}
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(value.boxOpacity * 100)}
                  onChange={(next) => set("boxOpacity", next / 100)}
                />
              </div>
            )}
          </fieldset>
        </div>
      )}

      <div className={styles.footer}>
        <p className={styles.note}>{text.note}</p>
        <Button
          variant="ghost"
          onClick={() => onSaveDefault(value)}
          isBusy={isSavingDefault}
          disabled={isDisabled || isDefault}
        >
          {isDefault ? text.isDefault : text.saveDefault}
        </Button>
      </div>
    </div>
  );
}
