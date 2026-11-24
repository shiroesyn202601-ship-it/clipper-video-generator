import { z } from "zod";
import { captionStyleSchema } from "./caption-style.ts";

/**
 * App-wide preferences in workspace/settings.json. Every field is optional with a default,
 * so a missing or older file still loads.
 */
export const appSettingsSchema = z.object({
  /** Style given to new clips; null = legacy look from the job settings. */
  defaultCaptionStyle: captionStyleSchema.nullable().default(null),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsBodySchema = appSettingsSchema.partial();
export type UpdateAppSettingsBody = z.infer<typeof updateAppSettingsBodySchema>;
