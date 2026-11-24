import {
  createClipBodySchema,
  generateCommentaryBodySchema,
  updateClipBodySchema,
  type Clip,
} from "@clipper/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ClipService } from "../jobs/clip-service.ts";
import type { CommentaryService } from "../jobs/commentary-service.ts";
import { revealInFileManager } from "../tools/reveal.ts";
import { parseInput } from "./validate.ts";

const jobParamsSchema = z.object({ id: z.string().uuid() });
const clipParamsSchema = z.object({ id: z.string().uuid(), clipId: z.string().uuid() });

export function registerClipRoutes(
  app: FastifyInstance,
  deps: { clips: ClipService; commentary: CommentaryService },
): void {
  const { clips, commentary } = deps;

  app.post("/jobs/:id/clips", async (request, reply): Promise<Clip> => {
    const { id } = parseInput(jobParamsSchema, request.params);
    const body = parseInput(createClipBodySchema, request.body);
    return reply.status(201).send(await clips.create(id, body));
  });

  app.patch("/jobs/:id/clips/:clipId", async (request): Promise<Clip> => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    const body = parseInput(updateClipBodySchema, request.body);
    return clips.update(id, clipId, body);
  });

  /** Writes the AI creator commentary (Groq chat) and stores it on the clip for editing. */
  app.post("/jobs/:id/clips/:clipId/commentary", async (request): Promise<Clip> => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    const body = parseInput(generateCommentaryBodySchema, request.body ?? {});
    return commentary.generate(id, clipId, body);
  });

  app.post("/jobs/:id/clips/:clipId/render", async (request): Promise<Clip> => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    return clips.render(id, clipId);
  });

  app.post("/jobs/:id/clips/:clipId/cancel", async (request, reply) => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    await clips.cancel(id, clipId);
    return reply.status(204).send();
  });

  /** Local-only convenience: open the clip folder (final.mp4) in the OS file manager. */
  app.post("/jobs/:id/clips/:clipId/reveal", (request, reply) => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    revealInFileManager(clips.clipDir(id, clipId));
    return reply.status(204).send();
  });

  app.delete("/jobs/:id/clips/:clipId", async (request, reply) => {
    const { id, clipId } = parseInput(clipParamsSchema, request.params);
    await clips.delete(id, clipId);
    return reply.status(204).send();
  });
}
