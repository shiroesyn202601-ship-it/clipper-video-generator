import {
  BRAND_IMAGE_EXTENSIONS,
  BRAND_POSITIONS,
  BRAND_TINT_STYLES,
  BRAND_VIDEO_EXTENSIONS,
  MAX_BRAND_OVERLAYS,
  brandOverlaySchema,
  type BrandKit,
  type BrandOverlay,
} from "@clipper/shared";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "../components/ui/Button.tsx";
import { useAppSettings, useUpdateAppSettings } from "../features/settings/settings-queries.ts";
import { api, errorText } from "../lib/api.ts";
import { copy } from "../lib/copy.ts";
import styles from "./BrandPage.module.css";

const ACCEPT = [...BRAND_IMAGE_EXTENSIONS, ...BRAND_VIDEO_EXTENSIONS]
  .map((ext) => `.${ext}`)
  .join(",");
const text = copy.brand;
type Placement = Pick<BrandOverlay, "position" | "size" | "opacity" | "margin">;

function isVideo(file: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(file);
}

function newOverlayId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** CSS placement inside the 9:16 preview, mirroring the ffmpeg overlay maths. */
function placementStyle(item: Placement): CSSProperties {
  if (item.position === "full") {
    return {
      left: 0,
      top: "50%",
      width: "100%",
      transform: "translateY(-50%)",
      opacity: item.opacity,
    };
  }
  const margin = `${item.margin}cqw`;
  const style: CSSProperties = { width: `${item.size}%`, opacity: item.opacity };
  const row = item.position === "c" ? "m" : item.position[0];
  const column = item.position === "c" ? "c" : item.position[1];
  const translate: string[] = [];
  if (column === "l") style.left = margin;
  else if (column === "r") style.right = margin;
  else {
    style.left = "50%";
    translate.push("translateX(-50%)");
  }
  if (row === "t") style.top = margin;
  else if (row === "b") style.bottom = margin;
  else {
    style.top = "50%";
    translate.push("translateY(-50%)");
  }
  if (translate.length > 0) style.transform = translate.join(" ");
  return style;
}

function tintBackground(tint: BrandKit["tint"]): string {
  const value = Number.parseInt(tint.color.slice(1), 16);
  const rgba = (alpha: number): string =>
    `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  const solid = rgba(tint.opacity);
  const clear = rgba(0);
  const reach = `${tint.reach}%`;
  if (tint.style === "solid") return solid;
  if (tint.style === "top") return `linear-gradient(180deg, ${solid} 0%, ${clear} ${reach})`;
  if (tint.style === "bottom") return `linear-gradient(0deg, ${solid} 0%, ${clear} ${reach})`;
  return `linear-gradient(180deg, ${solid} 0%, ${clear} ${reach}), linear-gradient(0deg, ${solid} 0%, ${clear} ${reach})`;
}

function Media({
  file,
  className,
  style,
}: {
  file: string;
  className?: string | undefined;
  style?: CSSProperties;
}) {
  const src = api.brandFileUrl(file);
  return isVideo(file) ? (
    // Decorative preview of a silent overlay; it carries no speech to caption.
    <video
      className={className}
      style={style}
      src={src}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden
    />
  ) : (
    <img className={className} style={style} src={src} alt="" />
  );
}

function Preview({ brand }: { brand: BrandKit }) {
  return (
    <div className={styles.preview} role="img" aria-label={text.previewLabel}>
      {brand.tint.enabled && (
        <div className={styles.tint} style={{ background: tintBackground(brand.tint) }} />
      )}
      {brand.overlays.map((overlay) => (
        <Media
          key={overlay.id}
          file={overlay.file}
          className={styles.layer}
          style={placementStyle(overlay)}
        />
      ))}
      {brand.logo.file && (
        <Media file={brand.logo.file} className={styles.layer} style={placementStyle(brand.logo)} />
      )}
      <p className={styles.sampleCaption}>{copy.captionStyle.sample}</p>
    </div>
  );
}

function Range(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
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
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  );
}

function PlacementFields<T extends Placement>(props: {
  value: T;
  allowFull: boolean;
  onChange: (next: T) => void;
}) {
  const { value, onChange } = props;
  const positions = props.allowFull ? [...BRAND_POSITIONS, "full" as const] : BRAND_POSITIONS;
  return (
    <>
      <label className={styles.field}>
        <span className={styles.label}>{text.position}</span>
        <select
          className={styles.control}
          value={value.position}
          onChange={(event) =>
            onChange({ ...value, position: event.target.value as T["position"] })
          }
        >
          {positions.map((position) => (
            <option key={position} value={position}>
              {text.positions[position]}
            </option>
          ))}
        </select>
      </label>
      {value.position !== "full" && (
        <>
          <Range
            label={text.size}
            value={value.size}
            min={3}
            max={100}
            display={text.percent(value.size)}
            onChange={(size) => onChange({ ...value, size })}
          />
          <Range
            label={text.margin}
            value={value.margin}
            min={0}
            max={20}
            display={text.percent(value.margin)}
            onChange={(margin) => onChange({ ...value, margin })}
          />
        </>
      )}
      <Range
        label={text.opacity}
        value={Math.round(value.opacity * 100)}
        min={5}
        max={100}
        step={5}
        display={text.percent(value.opacity * 100)}
        onChange={(opacity) => onChange({ ...value, opacity: opacity / 100 })}
      />
    </>
  );
}

function UploadButton(props: {
  kind: "logo" | "overlay";
  label: string;
  isDisabled?: boolean;
  onUploaded: (file: string) => void;
  onError: (error: unknown) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  return (
    <label className={`${styles.upload} ${props.isDisabled ? styles.uploadDisabled : ""}`}>
      <input
        type="file"
        accept={ACCEPT}
        className={styles.fileInput}
        disabled={props.isDisabled === true || isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setIsUploading(true);
          void api
            .uploadBrandFile(props.kind, file)
            .then(props.onUploaded)
            .catch(props.onError)
            .finally(() => setIsUploading(false));
        }}
      />
      <span>{isUploading ? text.uploading : props.label}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function BrandEditor({ initial }: { initial: BrandKit }) {
  const save = useUpdateAppSettings();
  const [brand, setBrand] = useState<BrandKit>(initial);
  const [uploadError, setUploadError] = useState<unknown>(null);
  const isDirty = JSON.stringify(brand) !== JSON.stringify(initial);
  const update = (patch: Partial<BrandKit>): void => setBrand({ ...brand, ...patch });
  const updateOverlay = (id: string, next: BrandOverlay): void =>
    update({ overlays: brand.overlays.map((item) => (item.id === id ? next : item)) });
  const error = uploadError ?? save.error;

  return (
    <div className={styles.layout}>
      <div className={styles.previewColumn}>
        <Preview brand={brand} />
      </div>
      <div className={styles.controls}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={brand.enabled}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          <span>{text.enabled}</span>
        </label>

        <Section title={text.logo}>
          {brand.logo.file ? (
            <div className={styles.fileRow}>
              <Media file={brand.logo.file} className={styles.thumb} />
              <UploadButton
                kind="logo"
                label={text.replace}
                onUploaded={(file) => update({ logo: { ...brand.logo, file } })}
                onError={setUploadError}
              />
              <Button
                variant="ghost"
                onClick={() => update({ logo: { ...brand.logo, file: null } })}
              >
                {text.remove}
              </Button>
            </div>
          ) : (
            <div className={styles.fileRow}>
              <p className={styles.muted}>{text.noLogo}</p>
              <UploadButton
                kind="logo"
                label={text.upload}
                onUploaded={(file) => update({ logo: { ...brand.logo, file } })}
                onError={setUploadError}
              />
            </div>
          )}
          {brand.logo.file && (
            <div className={styles.grid}>
              <PlacementFields
                value={brand.logo}
                allowFull={false}
                onChange={(logo) => update({ logo })}
              />
            </div>
          )}
        </Section>

        <Section title={text.overlays}>
          {brand.overlays.length === 0 && <p className={styles.muted}>{text.noOverlays}</p>}
          {brand.overlays.map((overlay) => (
            <div key={overlay.id} className={styles.overlay}>
              <div className={styles.fileRow}>
                <Media file={overlay.file} className={styles.thumb} />
                <Button
                  variant="ghost"
                  onClick={() =>
                    update({ overlays: brand.overlays.filter((item) => item.id !== overlay.id) })
                  }
                >
                  {text.remove}
                </Button>
              </div>
              <div className={styles.grid}>
                <PlacementFields
                  value={overlay}
                  allowFull
                  onChange={(next) => updateOverlay(overlay.id, next)}
                />
                <label className={styles.field}>
                  <span className={styles.label}>{text.show}</span>
                  <select
                    className={styles.control}
                    value={overlay.show}
                    onChange={(event) =>
                      updateOverlay(overlay.id, {
                        ...overlay,
                        show: event.target.value as BrandOverlay["show"],
                      })
                    }
                  >
                    {(["always", "first", "last"] as const).map((show) => (
                      <option key={show} value={show}>
                        {text.shows[show]}
                      </option>
                    ))}
                  </select>
                </label>
                {overlay.show !== "always" && (
                  <Range
                    label={text.seconds}
                    value={overlay.seconds}
                    min={1}
                    max={60}
                    display={String(overlay.seconds)}
                    onChange={(seconds) => updateOverlay(overlay.id, { ...overlay, seconds })}
                  />
                )}
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={overlay.chromaKey}
                    onChange={(event) =>
                      updateOverlay(overlay.id, { ...overlay, chromaKey: event.target.checked })
                    }
                  />
                  <span>{text.chromaKey}</span>
                </label>
              </div>
            </div>
          ))}
          <UploadButton
            kind="overlay"
            label={text.addOverlay}
            isDisabled={brand.overlays.length >= MAX_BRAND_OVERLAYS}
            onUploaded={(file) =>
              update({
                overlays: [
                  ...brand.overlays,
                  brandOverlaySchema.parse({ id: newOverlayId(), file }),
                ],
              })
            }
            onError={setUploadError}
          />
        </Section>

        <Section title={text.tint}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={brand.tint.enabled}
              onChange={(event) =>
                update({ tint: { ...brand.tint, enabled: event.target.checked } })
              }
            />
            <span>{text.tintEnabled}</span>
          </label>
          {brand.tint.enabled && (
            <div className={styles.grid}>
              <label className={styles.color}>
                <input
                  type="color"
                  value={brand.tint.color}
                  onChange={(event) =>
                    update({ tint: { ...brand.tint, color: event.target.value.toUpperCase() } })
                  }
                />
                <span>{text.tintColor}</span>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{text.tintStyle}</span>
                <select
                  className={styles.control}
                  value={brand.tint.style}
                  onChange={(event) =>
                    update({
                      tint: {
                        ...brand.tint,
                        style: event.target.value as BrandKit["tint"]["style"],
                      },
                    })
                  }
                >
                  {BRAND_TINT_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {text.tintStyles[style]}
                    </option>
                  ))}
                </select>
              </label>
              <Range
                label={text.opacity}
                value={Math.round(brand.tint.opacity * 100)}
                min={5}
                max={100}
                step={5}
                display={text.percent(brand.tint.opacity * 100)}
                onChange={(opacity) => update({ tint: { ...brand.tint, opacity: opacity / 100 } })}
              />
              {brand.tint.style !== "solid" && (
                <Range
                  label={text.reach}
                  value={brand.tint.reach}
                  min={10}
                  max={100}
                  display={text.percent(brand.tint.reach)}
                  onChange={(reach) => update({ tint: { ...brand.tint, reach } })}
                />
              )}
            </div>
          )}
        </Section>

        {error !== null && error !== undefined && (
          <p className={styles.error} role="alert">
            {errorText(error)}
          </p>
        )}
        <div className={styles.saveBar}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              setUploadError(null);
              save.mutate({ brand });
            }}
            isBusy={save.isPending}
            disabled={!isDirty}
          >
            {isDirty ? text.save : text.saved}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BrandPage() {
  const settings = useAppSettings();
  return (
    <section className={styles.page} aria-labelledby="brand-title">
      <h1 id="brand-title" className={styles.title}>
        {text.title}
      </h1>
      <p className={styles.intro}>{text.intro}</p>
      {settings.isPending && <p className={styles.muted}>{copy.common.loading}</p>}
      {settings.isError && <p role="alert">{errorText(settings.error)}</p>}
      {settings.data && (
        <BrandEditor
          // Re-seed the draft after a save so "Tersimpan" reflects the stored kit.
          key={JSON.stringify(settings.data.brand)}
          initial={settings.data.brand}
        />
      )}
    </section>
  );
}
