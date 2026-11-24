import path from "node:path";
import type { BrandKit, BrandOverlay } from "@clipper/shared";

type Placement = { position: string; size: number; opacity: number; margin: number };
type Layer = Placement & {
  file: string;
  chromaKey: boolean;
  /** ffmpeg overlay `enable` expression, or "" for always. */
  enable: string;
};

export type BrandGraph = {
  /** Extra ffmpeg input arguments, in order, starting at input index `firstInput`. */
  inputs: string[];
  /** filter_complex chains that put every layer on top of `inputLabel`. */
  filters: string[];
  outputLabel: string;
};

/** overlay x/y for a grid position ("tl", "bc", "c", ...) with a margin in pixels. */
export function overlayPosition(position: string, margin: number): [string, string] {
  const x = { l: `${margin}`, c: "(main_w-overlay_w)/2", r: `main_w-overlay_w-${margin}` };
  const y = { t: `${margin}`, m: "(main_h-overlay_h)/2", b: `main_h-overlay_h-${margin}` };
  if (position === "c") return [x.c, y.m];
  const row = position[0] as "t" | "m" | "b";
  const column = position[1] as "l" | "c" | "r";
  return [x[column], y[row]];
}

function showExpression(overlay: BrandOverlay, durationSec: number): string {
  if (overlay.show === "first") return `lte(t,${overlay.seconds.toFixed(2)})`;
  if (overlay.show === "last") {
    return `gte(t,${Math.max(0, durationSec - overlay.seconds).toFixed(2)})`;
  }
  return "";
}

function inputArgs(file: string, fps: number): string[] {
  const extension = path.extname(file).slice(1).toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    return ["-loop", "1", "-framerate", String(fps), "-i", file];
  }
  // libvpx decodes the alpha channel of WebM overlays; the native decoder drops it.
  const decoder = extension === "webm" ? ["-c:v", "libvpx-vp9"] : [];
  return [...decoder, "-stream_loop", "-1", "-i", file];
}

/**
 * Builds the ffmpeg inputs and filters for the brand kit: overlays first, the logo on top.
 * The tint is a separate pre-rendered image (see tintFilterExpression) placed under the
 * captions by the render stage.
 */
export function buildBrandGraph(options: {
  brand: BrandKit;
  brandDir: string;
  width: number;
  durationSec: number;
  fps: number;
  firstInput: number;
  inputLabel: string;
}): BrandGraph {
  const { brand, width } = options;
  const layers: Layer[] = brand.overlays.map((overlay) => ({
    ...overlay,
    file: path.join(options.brandDir, overlay.file),
    enable: showExpression(overlay, options.durationSec),
  }));
  if (brand.logo.file) {
    layers.push({
      ...brand.logo,
      file: path.join(options.brandDir, brand.logo.file),
      chromaKey: false,
      enable: "",
    });
  }

  const inputs: string[] = [];
  const filters: string[] = [];
  let current = options.inputLabel;
  layers.forEach((layer, index) => {
    const input = options.firstInput + index;
    inputs.push(...inputArgs(layer.file, options.fps));
    const chain: string[] = [];
    if (layer.chromaKey) chain.push("colorkey=0x00FF00:0.30:0.10");
    if (layer.position === "full") {
      chain.push(`scale=${width}:-2`);
    } else {
      const layerWidth = Math.max(2, Math.round((width * layer.size) / 100 / 2) * 2);
      chain.push(`scale=${layerWidth}:-2`);
    }
    chain.push(`fps=${options.fps}`, "format=rgba");
    if (layer.opacity < 1) chain.push(`colorchannelmixer=aa=${layer.opacity.toFixed(2)}`);
    filters.push(`[${input}:v]${chain.join(",")}[brand${index}]`);

    const [x, y] =
      layer.position === "full"
        ? ["0", "(main_h-overlay_h)/2"]
        : overlayPosition(layer.position, Math.round((width * layer.margin) / 100));
    const enable = layer.enable ? `:enable='${layer.enable}'` : "";
    const output = `[branded${index}]`;
    filters.push(
      `${current}[brand${index}]overlay=${x}:${y}:shortest=1:format=auto${enable}${output}`,
    );
    current = output;
  });
  return { inputs, filters, outputLabel: current };
}

/**
 * geq expressions for the tint image: the colour fades to transparent `reach` percent into
 * the frame (Y/H = 0 at the top, 1 at the bottom).
 */
export function tintFilterExpression(tint: BrandKit["tint"]): string {
  const value = Number.parseInt(tint.color.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const reach = (tint.reach / 100).toFixed(3);
  const fromBottom = `clip((Y/H-(1-${reach}))/${reach}\\,0\\,1)`;
  const fromTop = `clip((${reach}-Y/H)/${reach}\\,0\\,1)`;
  const shape = {
    solid: "1",
    bottom: fromBottom,
    top: fromTop,
    both: `max(${fromBottom}\\,${fromTop})`,
  }[tint.style];
  const alpha = `${(255 * tint.opacity).toFixed(1)}*${shape}`;
  return `format=rgba,geq=r=${r}:g=${g}:b=${b}:a=${alpha}`;
}
