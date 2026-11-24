import { z } from "zod";

/** Grid positions: t/m/b row + l/c/r column ("c" alone = center). */
export const BRAND_POSITIONS = ["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br"] as const;
export type BrandPosition = (typeof BRAND_POSITIONS)[number];

export const BRAND_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
export const BRAND_VIDEO_EXTENSIONS = ["gif", "mp4", "webm", "mov"] as const;
export const MAX_BRAND_OVERLAYS = 8;

/** Uploaded brand files live in workspace/brand/ under generated names only. */
export const BRAND_FILE_PATTERN = /^(logo|overlay)-[a-z0-9]{8}\.(png|jpe?g|webp|gif|mp4|webm|mov)$/;
const brandFile = z.string().regex(BRAND_FILE_PATTERN);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const placement = {
  /** Width as a percent of the frame width. */
  size: z.number().min(3).max(100),
  opacity: z.number().min(0.05).max(1),
  /** Distance from the frame edge, percent of the frame width. */
  margin: z.number().min(0).max(20),
};

export const brandLogoSchema = z.object({
  file: brandFile.nullable().default(null),
  position: z.enum(BRAND_POSITIONS).default("tr"),
  size: placement.size.default(16),
  opacity: placement.opacity.default(0.9),
  margin: placement.margin.default(4),
});

export const brandOverlaySchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,16}$/),
  file: brandFile,
  /** "full" stretches the overlay over the whole frame (frames, borders). */
  position: z.enum(["tl", "tc", "tr", "ml", "c", "mr", "bl", "bc", "br", "full"]).default("br"),
  size: placement.size.default(30),
  opacity: placement.opacity.default(1),
  margin: placement.margin.default(4),
  show: z.enum(["always", "first", "last"]).default("always"),
  /** For show = first / last. */
  seconds: z.number().min(1).max(60).default(5),
  /** Remove a pure green (#00FF00) background. */
  chromaKey: z.boolean().default(false),
});
export type BrandOverlay = z.infer<typeof brandOverlaySchema>;

export const BRAND_TINT_STYLES = ["bottom", "top", "both", "solid"] as const;

/** Colour gradient under the captions so they stay readable on bright footage. */
export const brandTintSchema = z.object({
  enabled: z.boolean().default(false),
  color: hexColor.default("#000000"),
  opacity: z.number().min(0.05).max(1).default(0.6),
  style: z.enum(BRAND_TINT_STYLES).default("bottom"),
  /** How far the gradient reaches into the frame, percent. */
  reach: z.number().min(10).max(100).default(50),
});

/**
 * Logo, overlays, and tint applied to every rendered clip. Off by default, so existing
 * clips render unchanged until the user turns it on; each clip can opt out (Clip.useBrand).
 */
export const brandKitSchema = z.object({
  enabled: z.boolean().default(false),
  logo: brandLogoSchema.default({}),
  overlays: z.array(brandOverlaySchema).max(MAX_BRAND_OVERLAYS).default([]),
  tint: brandTintSchema.default({}),
});
export type BrandKit = z.infer<typeof brandKitSchema>;

export function isBrandActive(brand: BrandKit): boolean {
  return (
    brand.enabled && (brand.logo.file !== null || brand.overlays.length > 0 || brand.tint.enabled)
  );
}

export const brandUploadResultSchema = z.object({ file: brandFile });
export type BrandUploadResult = z.infer<typeof brandUploadResultSchema>;
