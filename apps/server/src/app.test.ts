import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { config } from "./config.ts";

describe("web app serving", () => {
  let app: FastifyInstance;
  let webDistDir: string;

  beforeAll(async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "clipper-app-"));
    webDistDir = path.join(root, "dist");
    await mkdir(path.join(webDistDir, "assets"), { recursive: true });
    await writeFile(path.join(webDistDir, "index.html"), "<!doctype html><div id=root></div>");
    app = await buildApp({ ...config, webDistDir, workspaceDir: path.join(root, "workspace") });
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves assets created after start (rebuild without restart)", async () => {
    await writeFile(path.join(webDistDir, "assets", "index-new.js"), "export {};");
    const response = await app.inject("/assets/index-new.js");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");
  });

  it("falls back to index.html for client-side routes", async () => {
    const response = await app.inject("/jobs/abc/clips/def");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("returns real 404s for missing files and unknown API routes", async () => {
    expect((await app.inject("/assets/missing.js")).statusCode).toBe(404);
    const api = await app.inject("/api/nope");
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } });
  });
});
