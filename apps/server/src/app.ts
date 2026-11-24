import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import { registerHealthRoutes } from "./http/health-routes.ts";
import { AppError } from "./lib/errors.ts";

export type ApiErrorBody = { error: { code: string; message: string } };

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.isProduction ? "info" : "debug" },
    bodyLimit: 1024 * 1024,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ code: error.code, err: error }, error.message);
      const body: ApiErrorBody = { error: { code: error.code, message: error.userMessage } };
      return reply.status(error.statusCode).send(body);
    }
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    if (statusCode >= 500) request.log.error({ err: error }, "unexpected error");
    const body: ApiErrorBody = {
      error: {
        code: statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST",
        message: statusCode >= 500 ? "Terjadi kesalahan di server." : "Permintaan tidak valid.",
      },
    };
    return reply.status(statusCode).send(body);
  });

  await app.register(
    (api, _options, done) => {
      registerHealthRoutes(api, config);
      done();
    },
    { prefix: "/api" },
  );

  // Serve the built web app (npm run build) so `npm start` needs only one process.
  if (existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        const body: ApiErrorBody = { error: { code: "NOT_FOUND", message: "Tidak ditemukan." } };
        return reply.status(404).send(body);
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
