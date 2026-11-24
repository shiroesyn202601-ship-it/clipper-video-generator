import type { Caption, CaptionStyle } from "@clipper/shared";
import { assTime, escapeAssText } from "./ass.ts";

/** Caption design sizes are for a 1080 px wide frame. */
const DESIGN_WIDTH = 1080;
const ACTIVE_SCALE = 110;
const BOX_PADDING = 14;
const SHADOW_DEPTH = 3;
const PILL_BORDER = 16;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hexParts(hex: string): [string, string, string] {
  return [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
}

/** "#RRGGBB" + opacity 0..1 → style colour "&HAABBGGRR" (ASS alpha 00 = opaque). */
export function assStyleColor(hex: string, opacity = 1): string {
  const [r, g, b] = hexParts(hex);
  const alpha = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

/** "#RRGGBB" → override-tag colour "&HBBGGRR&". */
export function assTagColor(hex: string): string {
  const [r, g, b] = hexParts(hex);
  return `&H${b}${g}${r}&`.toUpperCase();
}

export type TimedWord = {
  text: string;
  startSec: number;
  endSec: number;
  /** The caption text had a line break before this word. */
  breaksLine: boolean;
};

/**
 * Captions store text and a time range, not word timings (and the user may have edited
 * the text), so the range is spread over the words by length. Each word gets a minimum
 * share so short words still light up long enough to read.
 */
export function timeWords(caption: Caption): TimedWord[] {
  const words: { text: string; breaksLine: boolean }[] = [];
  caption.text.split(/\r?\n/).forEach((line, lineIndex) => {
    line
      .split(/\s+/)
      .filter(Boolean)
      .forEach((text, wordIndex) => {
        words.push({ text, breaksLine: lineIndex > 0 && wordIndex === 0 });
      });
  });
  const weights = words.map((word) => word.text.length + 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const duration = Math.max(0, caption.endSec - caption.startSec);
  let cursor = caption.startSec;
  return words.map((word, index) => {
    const startSec = cursor;
    cursor += total > 0 ? (duration * (weights[index] ?? 0)) / total : 0;
    const isLast = index === words.length - 1;
    return {
      ...word,
      startSec: round3(startSec),
      endSec: round3(isLast ? caption.endSec : cursor),
    };
  });
}

type Layout = { fontSize: number; outline: number; x: number; y: number; scale: number };

function wordText(word: TimedWord, style: CaptionStyle): string {
  const text = style.uppercase ? word.text.toLocaleUpperCase("id-ID") : word.text;
  return escapeAssText(text);
}

/**
 * One caption line with per-word tags. `active` is the index of the word being spoken
 * (null = none); `isEntrance` adds the pop-in on the caption's first event.
 */
function renderLine(
  words: readonly TimedWord[],
  style: CaptionStyle,
  layout: Layout,
  active: number | null,
  isEntrance: boolean,
): string {
  const text = assTagColor(style.textColor);
  const highlight = assTagColor(style.highlightColor);
  const outlineColor = assTagColor(style.outlineColor);
  const pillBorder = Math.round(PILL_BORDER * layout.scale);

  return words
    .map((word, index) => {
      const isActive = index === active;
      let color = text;
      let border = `\\3c${outlineColor}\\bord${layout.outline}`;
      let scale = 100;
      if (isActive && style.highlightMode === "color") {
        color = highlight;
        scale = ACTIVE_SCALE;
      } else if (isActive && style.highlightMode === "pill") {
        // A thick rounded border in the highlight colour reads as a pill behind the word.
        if (style.box) color = highlight;
        else border = `\\3c${highlight}\\bord${Math.max(layout.outline, pillBorder)}`;
        scale = ACTIVE_SCALE;
      }
      const grow =
        isEntrance && style.animation === "pop"
          ? `\\fscx${Math.round(scale * 0.8)}\\fscy${Math.round(scale * 0.8)}\\t(0,120,\\fscx${scale}\\fscy${scale})`
          : `\\fscx${scale}\\fscy${scale}`;
      const borderTags = style.box ? "" : border;
      const separator = index === 0 ? "" : word.breaksLine ? "\\N" : " ";
      return `${separator}{\\1c${color}${borderTags}${grow}}${wordText(word, style)}`;
    })
    .join("");
}

function linePrefix(style: CaptionStyle, layout: Layout, isEntrance: boolean): string {
  const position =
    isEntrance && style.animation === "slide-up"
      ? `\\move(${layout.x},${layout.y + Math.round(40 * layout.scale)},${layout.x},${layout.y},0,160)`
      : `\\pos(${layout.x},${layout.y})`;
  const fade = isEntrance && style.animation === "fade" ? "\\fad(150,0)" : "";
  return `{\\an5${position}${fade}}`;
}

function karaokeLine(words: readonly TimedWord[], style: CaptionStyle, captionStart: number) {
  const before = assTagColor(style.textColor);
  const after = assTagColor(style.highlightColor);
  return words
    .map((word, index) => {
      const from = index === 0 ? captionStart : word.startSec;
      const centiseconds = Math.max(1, Math.round((word.endSec - from) * 100));
      const separator = index === 0 ? "" : word.breaksLine ? "\\N" : " ";
      // \kf sweeps from the secondary colour (not yet spoken) to the primary one.
      return `${separator}{\\kf${centiseconds}\\1c${after}\\2c${before}}${wordText(word, style)}`;
    })
    .join("");
}

/** ASS subtitles for a clip with a caption style (see captionStyleSchema). */
export function buildStyledAss(
  captions: readonly Caption[],
  options: { style: CaptionStyle; width: number; height: number },
): string {
  const { style, width, height } = options;
  const scale = width / DESIGN_WIDTH;
  const layout: Layout = {
    scale,
    fontSize: Math.round(style.fontSize * scale),
    outline: Math.round(style.outlineWidth * scale),
    x: Math.round(width / 2),
    y: Math.round((height * style.positionY) / 100),
  };
  const isBold = style.font === "Arial" ? -1 : 0;
  const borderStyle = style.box ? 3 : 1;
  const outlineColour = style.box
    ? assStyleColor(style.boxColor, style.boxOpacity)
    : assStyleColor(style.outlineColor);
  const backColour = style.box
    ? assStyleColor(style.boxColor, style.boxOpacity)
    : assStyleColor("#000000", style.shadow ? 0.5 : 0);
  const outline = style.box ? Math.round(BOX_PADDING * scale) : layout.outline;
  const shadow = style.box || !style.shadow ? 0 : Math.round(SHADOW_DEPTH * scale);
  const margin = Math.round(width * 0.06);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${style.font},${layout.fontSize},${assStyleColor(style.textColor)},${assStyleColor(style.textColor)},${outlineColour},${backColour},${isBold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},5,${margin},${margin},0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events: string[] = [];
  const dialogue = (start: number, end: number, text: string): void => {
    if (end > start)
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${text}`);
  };

  for (const caption of captions) {
    if (caption.endSec <= caption.startSec) continue;
    const words = timeWords(caption);
    if (words.length === 0) continue;

    if (style.highlightMode === "karaoke") {
      dialogue(
        caption.startSec,
        caption.endSec,
        `${linePrefix(style, layout, true)}${karaokeLine(words, style, caption.startSec)}`,
      );
    } else if (style.highlightMode === "none") {
      dialogue(
        caption.startSec,
        caption.endSec,
        `${linePrefix(style, layout, true)}${renderLine(words, style, layout, null, true)}`,
      );
    } else {
      // One event per spoken word, so the highlight moves along the caption.
      words.forEach((word, index) => {
        const isEntrance = index === 0;
        const start = isEntrance ? caption.startSec : word.startSec;
        dialogue(
          start,
          word.endSec,
          `${linePrefix(style, layout, isEntrance)}${renderLine(words, style, layout, index, isEntrance)}`,
        );
      });
    }
  }
  return [...header, ...events, ""].join("\n");
}
