import type { Caption, JobSettings } from "@clipper/shared";

type SubtitleStyle = JobSettings["subtitleStyle"];

type StyleSpec = {
  fontSize: number;
  outline: number;
  /** 1 = outline + shadow, 3 = opaque box behind the text. */
  borderStyle: 1 | 3;
  /** Distance from the bottom edge as a share of the height. */
  marginVRatio: number;
  backColour: string;
};

/**
 * Both styles stay out of the platform UI zones (bottom ~15% and top ~10% of the frame).
 * Sizes are for a 1080 px wide frame and scale with the width.
 */
const STYLES: Record<SubtitleStyle, StyleSpec> = {
  "bold-center": {
    fontSize: 80,
    outline: 6,
    borderStyle: 1,
    marginVRatio: 0.3,
    backColour: "&H00000000",
  },
  "lower-third": {
    fontSize: 64,
    outline: 18,
    borderStyle: 3,
    marginVRatio: 0.18,
    backColour: "&H99000000",
  },
};

/** Font used for burned-in subtitles; available on Windows and macOS, libass falls back elsewhere. */
const FONT_NAME = "Arial";

/** "H:MM:SS.cc" (ASS uses centiseconds). */
export function assTime(seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(totalCs / 360_000);
  const minutes = Math.floor((totalCs % 360_000) / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`;
}

/**
 * Makes user-edited caption text safe for ASS: braces would start override tags and a
 * backslash could inject \N or other codes. Newlines become ASS line breaks.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "/")
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

export function buildAss(
  captions: readonly Caption[],
  options: { style: SubtitleStyle; width: number; height: number },
): string {
  const spec = STYLES[options.style];
  const scale = options.width / 1080;
  const fontSize = Math.round(spec.fontSize * scale);
  const outline = Math.round(spec.outline * scale);
  const marginV = Math.round(options.height * spec.marginVRatio);
  const marginH = Math.round(options.width * 0.08);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${options.width}`,
    `PlayResY: ${options.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${FONT_NAME},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,${spec.backColour},-1,0,0,0,100,100,0,0,${spec.borderStyle},${outline},0,2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = captions
    .filter((caption) => caption.endSec > caption.startSec && caption.text.trim().length > 0)
    .map(
      (caption) =>
        `Dialogue: 0,${assTime(caption.startSec)},${assTime(caption.endSec)},Default,,0,0,0,,${escapeAssText(caption.text)}`,
    );
  return [...header, ...events, ""].join("\n");
}
