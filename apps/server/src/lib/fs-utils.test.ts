import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson, resolveInside, sanitizeFileName, writeJsonAtomic } from "./fs-utils.ts";

describe("resolveInside", () => {
  const root = path.resolve("/workspace/job-1");

  it("resolves a nested relative path", () => {
    expect(resolveInside(root, "source/video.mp4")).toBe(path.join(root, "source", "video.mp4"));
  });

  it.each(["../other/job.json", "../../etc/passwd", "source/../../x", path.resolve("/etc/passwd")])(
    "rejects %s",
    (input) => {
      expect(() => resolveInside(root, input)).toThrow(/escapes root/);
    },
  );
});

describe("sanitizeFileName", () => {
  it("strips directories and reserved characters", () => {
    expect(sanitizeFileName("../../evil:name?.mp4")).toBe("evil_name_.mp4");
  });

  it("removes leading dashes so the name cannot look like a CLI flag", () => {
    expect(sanitizeFileName("--version.mp4")).toBe("version.mp4");
  });

  it("falls back to a default name", () => {
    expect(sanitizeFileName("...")).toBe("video");
  });
});

describe("writeJsonAtomic", () => {
  it("writes JSON that readJson can validate", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clipper-fs-"));
    const file = path.join(dir, "nested", "data.json");
    await writeJsonAtomic(file, { count: 2 });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ count: 2 });
    await expect(readJson(file, z.object({ count: z.number() }))).resolves.toEqual({ count: 2 });
  });
});
