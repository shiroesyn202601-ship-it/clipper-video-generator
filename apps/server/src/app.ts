import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.ts";
import { registerClipRoutes } from "./http/clip-routes.ts";
import { registerHealthRoutes } from "./http/health-routes.ts";
import { registerJobRoutes } from "./http/job-routes.ts";
import { ClipService } from "./jobs/clip-service.ts";
import { JobQueue } from "./jobs/job-queue.ts";
import { JobService } from "./jobs/job-service.ts";
import { JobStore } from "./jobs/job-store.ts";
import { AppError } from "./lib/errors.ts";
import { createPipelineRunner } from "./pipeline/run-pipeline.ts";
import { analysisStages, clipStages } from "./pipeline/stages/index.ts";

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

  await mkdir(config.workspaceDir, { recursive: true });
  const store = new JobStore(config.workspaceDir, app.log);
  await store.load();

  // Decorates reply.sendFile (with HTTP Range support) without serving anything by itself.
  await app.register(fastifyStatic, { root: config.workspaceDir, serve: false });
  await app.register(fastifyMultipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 4, fieldSize: 64 * 1024 },
  });
  const runTask = createPipelineRunner({
    config,
    store,
    logger: app.log,
    analysisStages,
    clipStages,
  });
  const queue = new JobQueue(runTask, app.log);
  const service = new JobService(store, queue);
  const clips = new ClipService(store, queue, service);

  await app.register(
    (api, _options, done) => {
      registerHealthRoutes(api, config);
      registerJobRoutes(api, { service, store });
      registerClipRoutes(api, { clips });
      done();
    },
    { prefix: "/api" },
  );

  // Serve the built web app (npm run build) so `npm start` needs only one process.
  if (existsSync(config.webDistDir)) {
    // Wildcard mode looks files up per request, so a rebuild (new hashed asset names) works
    // without restarting the server.
    await app.register(fastifyStatic, { root: config.webDistDir, decorateReply: false });
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split("?")[0] ?? "";
      // API paths and missing files (anything with an extension) are real 404s;
      // every other path is a client-side route of the single-page app.
      if (pathname.startsWith("/api/") || /\.[a-z0-9]+$/i.test(pathname)) {
        const body: ApiErrorBody = { error: { code: "NOT_FOUND", message: "Tidak ditemukan." } };
        return reply.status(404).send(body);
      }
      return reply.sendFile("index.html", config.webDistDir);
    });
  }

  app.addHook("onReady", async () => {
    await service.recover();
  });

  return app;
}
