import path from "node:path";
import {
  createJobBodySchema,
  jobSettingsInputSchema,
  candidatesFileSchema,
  transcriptSchema,
  type CandidatesFile,
  type Transcript,
  type Job,
  type JobEvent,
  type JobSettingsInput,
  type JobSummary,
} from "@clipper/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobService } from "../jobs/job-service.ts";
import type { JobStore } from "../jobs/job-store.ts";
import { AppError } from "../lib/errors.ts";
import { resolveInside } from "../lib/fs-utils.ts";
import { transcriptToVtt } from "../pipeline/transcript/normalize.ts";
import { parseInput } from "./validate.ts";

function parseJsonField(value: unknown): unknown {
  try {
    return JSON.parse(String(value));
  } catch {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "settings field is not JSON",
      userMessage: "Pengaturan tidak valid.",
      statusCode: 400,
    });
  }
}

const SSE_HEARTBEAT_MS = 15_000;

export const jobParamsSchema = z.object({ id: z.string().uuid() });

export function registerJobRoutes(
  app: FastifyInstance,
  deps: { service: JobService; store: JobStore },
): void {
  const { service, store } = deps;

  app.get("/jobs", (): JobSummary[] => service.list());

  app.post("/jobs", async (request, reply): Promise<Job> => {
    const body = parseInput(createJobBodySchema, request.body);
    const job = await service.create({ kind: "url", url: body.url }, body.settings);
    service.start(job.id);
    return reply.status(201).send(job);
  });

  /** multipart/form-data: optional "settings" (JSON string) field first, then one "file". */
  app.post("/jobs/upload", async (request, reply): Promise<Job> => {
    let settingsInput: JobSettingsInput | undefined;
    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname === "settings") {
        settingsInput = parseInput(jobSettingsInputSchema, parseJsonField(part.value));
        continue;
      }
      if (part.type === "file") {
        const job = await service.createFromUpload({
          originalName: part.filename,
          settingsInput,
          stream: part.file,
        });
        service.start(job.id);
        return reply.status(201).send(job);
      }
    }
    throw new AppError({
      code: "UPLOAD_MISSING_FILE",
      message: "multipart request without a file part",
      userMessage: "Tidak ada file yang dikirim.",
      statusCode: 400,
    });
  });

  /** Streams a file from the job folder (video preview, final clip). Supports HTTP Range. */
  app.get("/jobs/:id/media/*", (request, reply) => {
    const { id } = parseInput(jobParamsSchema, request.params);
    const relative = parseInput(z.object({ "*": z.string().min(1) }), request.params)["*"];
    service.get(id);
    const jobDir = store.jobDir(id);
    const absolute = resolveInside(jobDir, relative);
    return reply.sendFile(path.relative(jobDir, absolute), jobDir);
  });

  app.get("/jobs/:id/transcript", async (request): Promise<Transcript> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.readArtifact(id, "transcript", transcriptSchema);
  });

  app.get("/jobs/:id/candidates", async (request): Promise<CandidatesFile> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.readArtifact(id, "candidates", candidatesFileSchema);
  });

  app.get("/jobs/:id/transcript.vtt", async (request, reply) => {
    const { id } = parseInput(jobParamsSchema, request.params);
    const transcript = await service.readArtifact(id, "transcript", transcriptSchema);
    return reply.type("text/vtt; charset=utf-8").send(transcriptToVtt(transcript));
  });

  app.get("/jobs/:id", (request): Job => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.get(id);
  });

  app.post("/jobs/:id/cancel", async (request): Promise<Job> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.cancel(id);
  });

  app.post("/jobs/:id/stages/:stageId/skip", async (request): Promise<Job> => {
    const { id, stageId } = parseInput(
      z.object({ id: z.string().uuid(), stageId: z.string().min(1).max(40) }),
      request.params,
    );
    return service.skipStage(id, stageId);
  });

  app.post("/jobs/:id/retry", async (request): Promise<Job> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.retry(id);
  });

  app.delete("/jobs/:id", async (request, reply) => {
    const { id } = parseInput(jobParamsSchema, request.params);
    await service.delete(id);
    return reply.status(204).send();
  });

  /** Server-sent events: full job snapshot on every change. */
  app.get("/jobs/:id/events", (request, reply) => {
    const { id } = parseInput(jobParamsSchema, request.params);
    const job = service.get(id);

    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: JobEvent): void => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "job-update", job });

    const unsubscribe = store.subscribe(id, send);
    const heartbeat = setInterval(() => response.write(": ping\n\n"), SSE_HEARTBEAT_MS);
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
