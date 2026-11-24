import { describe, expect, it } from "vitest";
import { outputPath, parseWorkerLine } from "./worker.ts";

describe("parseWorkerLine", () => {
  it("parses protocol messages", () => {
    expect(parseWorkerLine('{"type": "progress", "percent": 12.5, "message": "x"}')).toEqual({
      type: "progress",
      percent: 12.5,
      message: "x",
    });
    expect(parseWorkerLine('{"type": "result", "outputs": {"a": "b"}}')).toEqual({
      type: "result",
      outputs: { a: "b" },
    });
  });

  it("ignores noise and malformed JSON", () => {
    expect(parseWorkerLine("Downloading model...")).toBeNull();
    expect(parseWorkerLine("{not json")).toBeNull();
    expect(parseWorkerLine('{"type": "other"}')).toBeNull();
  });
});

describe("outputPath", () => {
  it("returns string outputs and rejects missing ones", () => {
    expect(outputPath({ vocals: "a.wav" }, "vocals")).toBe("a.wav");
    expect(() => outputPath({}, "vocals")).toThrow(/missing/);
  });
});
