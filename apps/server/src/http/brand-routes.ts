import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  BRAND_FILE_PATTERN,
  BRAND_IMAGE_EXTENSIONS,
  BRAND_VIDEO_EXTENSIONS,
  type BrandUploadResult,
} from "@clipper/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../lib/errors.ts";
import { parseInput } from "./validate.ts";

const ALLOWED_EXTENSIONS = new Set<string>([...BRAND_IMAGE_EXTENSIONS, ...BRAND_VIDEO_EXTENSIONS]);
const fileParamsSchema = z.object({ file: z.string().regex(BRAND_FILE_PATTERN) });
const kindSchema = z.enum(["logo", "overlay"]);

function badUpload(message: string, userMessage: string): AppError {
  return new AppError({ code: "BRAND_UPLOAD_INVALID", message, userMessage, statusCode: 400 });
}

/** Brand kit files (logo, overlays) in workspace/brand/, referenced from settings.json. */
export function registerBrandRoutes(app: FastifyInstance, deps: { brandDir: string }): void {
  const { brandDir } = deps;

  /** multipart/form-data: "kind" field (logo | overlay) first, then one "file". */
  app.post("/brand/files", async (request, reply): Promise<BrandUploadResult> => {
    let kind: z.infer<typeof kindSchema> | null = null;
    for await (const part of request.parts()) {
      if (part.type === "field" && part.fieldname === "kind") {
        kind = parseInput(kindSchema, part.value);
        continue;
      }
      if (part.type !== "file") continue;
      if (!kind) throw badUpload("kind field missing before file", "Jenis file brand tidak dikirim.");
      const extension = path.extname(part.filename).slice(1).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        part.file.resume();
        throw badUpload(
          `unsupported brand file type .${extension}`,
          "Format tidak didukung. Pakai PNG, JPG, WEBP, GIF, MP4, WEBM, atau MOV.",
        );
      }
      // Generated name: the user's file name never reaches the disk or an ffmpeg argument.
      const file = `${kind}-${randomBytes(4).toString("hex")}.${extension}`;
      await mkdir(brandDir, { recursive: true });
      const destination = path.join(brandDir, file);
      try {
        await pipeline(part.file, createWriteStream(destination));
      } catch (error) {
        await rm(destination, { force: true });
        throw error;
      }
      if (part.file.truncated) {
        await rm(destination, { force: true });
        throw badUpload("brand file too large", "File terlalu besar.");
      }
      return reply.status(201).send({ file });
    }
    throw badUpload("multipart request without a file part", "Tidak ada file yang dikirim.");
  });

  app.get("/brand/files/:file", (request, reply) => {
    const { file } = parseInput(fileParamsSchema, request.params);
    return reply.sendFile(file, brandDir);
  });
}
