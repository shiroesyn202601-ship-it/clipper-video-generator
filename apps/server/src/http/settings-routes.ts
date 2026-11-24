import { existsSync } from "node:fs";
import path from "node:path";
import { CAPTION_FONTS, updateAppSettingsBodySchema, type AppSettings } from "@clipper/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.ts";
import type { SettingsStore } from "../settings/settings-store.ts";
import { parseInput } from "./validate.ts";

const fontFiles = new Set<string>(
  Object.values(CAPTION_FONTS).filter((file): file is string => file !== null),
);
const fontParamsSchema = z.object({ file: z.string().refine((file) => fontFiles.has(file)) });

export function registerSettingsRoutes(
  app: FastifyInstance,
  deps: { config: Config; settings: SettingsStore },
): void {
  const { config, settings } = deps;

  app.get("/settings", (): AppSettings => settings.get());

  app.patch("/settings", async (request): Promise<AppSettings> => {
    const body = parseInput(updateAppSettingsBodySchema, request.body);
    return settings.update(body);
  });

  /** Which caption fonts are downloaded (SETUP.md step 5c). */
  app.get("/fonts", (): Record<string, boolean> =>
    Object.fromEntries(
      Object.entries(CAPTION_FONTS).map(([name, file]) => [
        name,
        file === null || existsSync(path.join(config.fontsDir, file)),
      ]),
    ),
  );

  /** Font files for the caption preview (@font-face); only names from CAPTION_FONTS. */
  app.get("/fonts/:file", (request, reply) => {
    const { file } = parseInput(fontParamsSchema, request.params);
    return reply.header("cache-control", "public, max-age=86400").sendFile(file, config.fontsDir);
  });
}
