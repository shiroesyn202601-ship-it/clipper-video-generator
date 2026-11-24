import type { FastifyInstance } from "fastify";
import type { HealthReport } from "@clipper/shared";
import type { Config } from "../config.ts";
import { checkHealth } from "../tools/health.ts";

export function registerHealthRoutes(app: FastifyInstance, config: Config): void {
  app.get("/health", async (): Promise<HealthReport> => checkHealth(config));
}
