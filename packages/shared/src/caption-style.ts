import { z } from "zod";

/**
 * Fonts offered in the caption editor. All are free (SIL OFL / Apache) and downloaded to
 * tools/fonts/ (SETUP.md step 5c); "Arial" is the system font used by the legacy styles.
 */
export const CAPTION_FONTS = {
  "Montserrat ExtraBold": "Montserrat-ExtraBold.ttf",
  Anton: "Anton-Regular.ttf",
  "Bebas Neue": "BebasNeue-Regular.ttf",
  "Poppins Bold": "Poppins-Bold.ttf",
  "Luckiest Guy": "LuckiestGuy-Regular.ttf",
  Arial: null,
} as const satisfies Record<string, string | null>;
export type CaptionFont = keyof typeof CAPTION_FONTS;
const FONT_NAMES = Object.keys(CAPTION_FONTS) as [CaptionFont, ...CaptionFont[]];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Warna harus berformat #RRGGBB");

export const HIGHLIGHT_MODES = ["none", "color", "pill", "karaoke"] as const;
export const CAPTION_ANIMATIONS = ["none", "pop", "fade", "slide-up"] as const;

/**
 * Per-clip caption look, CapCut style. A clip without a style (null) keeps the legacy
 * look from JobSettings.subtitleStyle, so clips made before this feature render unchanged.
 */
export const captionStyleSchema = z.object({
  font: z.enum(FONT_NAMES).default("Montserrat ExtraBold"),
  /** Pixels on a 1080 px wide frame; scaled with the output width. */
  fontSize: z.number().int().min(32).max(160).default(80),
  uppercase: z.boolean().default(true),
  textColor: hexColor.default("#FFFFFF"),
  /** How the word being spoken stands out. */
  highlightMode: z.enum(HIGHLIGHT_MODES).default("color"),
  highlightColor: hexColor.default("#FFE600"),
  outlineColor: hexColor.default("#000000"),
  outlineWidth: z.number().min(0).max(16).default(6),
  shadow: z.boolean().default(true),
  /** Semi-transparent box behind each caption. */
  box: z.boolean().default(false),
  boxColor: hexColor.default("#000000"),
  boxOpacity: z.number().min(0).max(1).default(0.6),
  /** Vertical center of the caption, percent of the frame height (top = 0). */
  positionY: z.number().min(10).max(90).default(68),
  animation: z.enum(CAPTION_ANIMATIONS).default("pop"),
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;

export const DEFAULT_CAPTION_STYLE: CaptionStyle = captionStyleSchema.parse({});

export const CAPTION_PRESETS = {
  "bold-yellow": DEFAULT_CAPTION_STYLE,
  "pill-purple": {
    ...DEFAULT_CAPTION_STYLE,
    font: "Poppins Bold",
    highlightMode: "pill",
    highlightColor: "#7B2FF7",
    outlineWidth: 4,
  },
  karaoke: {
    ...DEFAULT_CAPTION_STYLE,
    font: "Anton",
    highlightMode: "karaoke",
    highlightColor: "#00E5FF",
    animation: "none",
  },
  "clean-box": {
    ...DEFAULT_CAPTION_STYLE,
    font: "Poppins Bold",
    fontSize: 64,
    uppercase: false,
    highlightMode: "none",
    outlineWidth: 0,
    shadow: false,
    box: true,
    positionY: 78,
    animation: "fade",
  },
  comic: {
    ...DEFAULT_CAPTION_STYLE,
    font: "Luckiest Guy",
    fontSize: 88,
    highlightColor: "#7CFF4F",
    outlineWidth: 8,
  },
} as const satisfies Record<string, CaptionStyle>;
export type CaptionPresetId = keyof typeof CAPTION_PRESETS;
