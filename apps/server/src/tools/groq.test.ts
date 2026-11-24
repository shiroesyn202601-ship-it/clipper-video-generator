import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../lib/errors.ts";
import { GroqKeyPool, maskKey, parseRetryAfter, transcribeWithGroq } from "./groq.ts";

describe("parseRetryAfter", () => {
  it("reads seconds and Groq duration strings", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    expect(parseRetryAfter("1.5")).toBe(1500);
    expect(parseRetryAfter("2m59.5s")).toBe(179_500);
    expect(parseRetryAfter("500ms")).toBe(500);
    expect(parseRetryAfter("1h2m")).toBe(3_720_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });
});

describe("GroqKeyPool", () => {
  it("rotates keys and skips cooling or rejected ones", () => {
    const pool = new GroqKeyPool(["a", "b", "c"]);
    expect(pool.pick(0)).toEqual({ kind: "key", key: "a" });
    expect(pool.pick(0)).toEqual({ kind: "key", key: "b" });
    pool.coolDown("c", 5000, 0);
    pool.reject("a");
    expect(pool.pick(0)).toEqual({ kind: "key", key: "b" });
    pool.coolDown("b", 3000, 0);
    expect(pool.pick(0)).toEqual({ kind: "wait", ms: 3000 });
    expect(pool.pick(3500)).toEqual({ kind: "key", key: "b" });
    pool.reject("b");
    pool.reject("c");
    expect(pool.pick(0)).toEqual({ kind: "none" });
  });

  it("masks keys for logs", () => {
    expect(maskKey("gsk_secret1234")).toBe("…1234");
  });
});

describe("transcribeWithGroq", () => {
  let dir = "";
  let file = "";
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "groq-test-"));
    file = path.join(dir, "chunk-000.flac");
    await writeFile(file, Buffer.from("fake audio"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const base = {
    baseUrl: "https://example.test",
    model: "m",
    language: "id",
    log: () => Promise.resolve(),
  };

  it("moves to the next key when one hits the rate limit", async () => {
    const usedKeys: string[] = [];
    const fetchImpl = ((_url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get("authorization") ?? "";
      usedKeys.push(auth);
      if (auth.endsWith("one")) {
        return Promise.resolve(
          new Response("limit", { status: 429, headers: { "retry-after": "600" } }),
        );
      }
      return Promise.resolve(Response.json({ language: "indonesian", segments: [], words: [] }));
    }) as typeof fetch;
    const pool = new GroqKeyPool(["one", "two"]);
    const body = await transcribeWithGroq({
      ...base,
      pool,
      filePath: file,
      signal: new AbortController().signal,
      fetchImpl,
    });
    expect(body).toMatchObject({ language: "indonesian" });
    expect(usedKeys).toEqual(["Bearer one", "Bearer two"]);
    // the limited key stays parked for the next request
    expect(pool.pick()).toEqual({ kind: "key", key: "two" });
  });

  it("gives up when every key is out of quota for a long time", async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response("limit", { status: 429, headers: { "retry-after": "3600" } }),
      )) as unknown as typeof fetch;
    await expect(
      transcribeWithGroq({
        ...base,
        pool: new GroqKeyPool(["one", "two"]),
        filePath: file,
        signal: new AbortController().signal,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "GROQ_QUOTA_EXHAUSTED" });
  });

  it("drops rejected keys and fails without retrying bad requests", async () => {
    const pool = new GroqKeyPool(["bad", "good"]);
    const fetchImpl = ((_url: string, init: RequestInit) => {
      const auth = new Headers(init.headers).get("authorization") ?? "";
      return Promise.resolve(
        auth.endsWith("bad")
          ? new Response("invalid key", { status: 401 })
          : new Response("too large", { status: 413 }),
      );
    }) as typeof fetch;
    const error = await transcribeWithGroq({
      ...base,
      pool,
      filePath: file,
      signal: new AbortController().signal,
      fetchImpl,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "GROQ_REQUEST_FAILED" });
    expect(pool.usableCount).toBe(1);
  });
});
