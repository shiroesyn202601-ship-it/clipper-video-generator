import { createJobBodySchema, type Job, type JobEvent, type JobSummary } from "@clipper/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { JobService } from "../jobs/job-service.ts";
import type { JobStore } from "../jobs/job-store.ts";
import { parseInput } from "./validate.ts";

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

  app.get("/jobs/:id", (request): Job => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.get(id);
  });

  app.post("/jobs/:id/cancel", async (request): Promise<Job> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    return service.cancel(id);
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
