import path from "node:path";
import {
  appSettingsSchema,
  type AppSettings,
  type UpdateAppSettingsBody,
} from "@clipper/shared";
import type { FastifyBaseLogger } from "fastify";
import { readJson, writeJsonAtomic } from "../lib/fs-utils.ts";

/** Reads workspace/settings.json; defaults when it is missing or broken (used by render). */
export async function readAppSettings(workspaceDir: string): Promise<AppSettings> {
  try {
    return await readJson(path.join(workspaceDir, "settings.json"), appSettingsSchema);
  } catch {
    return appSettingsSchema.parse({});
  }
}

/** App-wide preferences in workspace/settings.json (created on the first change). */
export class SettingsStore {
  readonly #filePath: string;
  readonly #logger: FastifyBaseLogger;
  #settings: AppSettings = appSettingsSchema.parse({});

  constructor(workspaceDir: string, logger: FastifyBaseLogger) {
    this.#filePath = path.join(workspaceDir, "settings.json");
    this.#logger = logger;
  }

  async load(): Promise<void> {
    try {
      this.#settings = await readJson(this.#filePath, appSettingsSchema);
    } catch (error) {
      // Missing file is normal; a broken one falls back to defaults instead of blocking startup.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.#logger.warn({ err: error }, "settings.json unreadable, using defaults");
      }
    }
  }

  get(): AppSettings {
    return this.#settings;
  }

  async update(patch: UpdateAppSettingsBody): Promise<AppSettings> {
    const next = appSettingsSchema.parse({ ...this.#settings, ...patch });
    await writeJsonAtomic(this.#filePath, next);
    this.#settings = next;
    return next;
  }
}
