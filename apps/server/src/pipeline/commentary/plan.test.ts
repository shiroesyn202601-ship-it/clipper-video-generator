import { COMMENTARY_LIMITS } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { clampText, commentaryUserPrompt, parseCommentaryPlan } from "./plan.ts";

describe("clampText", () => {
  it("keeps short text and squashes whitespace", () => {
    expect(clampText("  halo   semua ", 50)).toBe("halo semua");
  });

  it("cuts at a sentence end when one is close", () => {
    expect(clampText("Satu dua tiga. Empat lima enam tujuh", 20)).toBe("Satu dua tiga.");
  });

  it("otherwise cuts at a word boundary", () => {
    expect(clampText("satu dua tiga empat lima", 16)).toBe("satu dua tiga");
  });
});

describe("parseCommentaryPlan", () => {
  it("fills missing fields and enforces the limits", () => {
    const plan = parseCommentaryPlan({ intro: "kata ".repeat(100) });
    expect(plan.outro).toBe("");
    expect(plan.intro.length).toBeLessThanOrEqual(COMMENTARY_LIMITS.introMaxChars);
  });

  it("rejects a non-object answer", () => {
    expect(() => parseCommentaryPlan("bukan json")).toThrow();
  });
});

describe("commentaryUserPrompt", () => {
  it("uses a default persona", () => {
    const prompt = commentaryUserPrompt({ title: null, persona: " ", transcript: "halo" });
    expect(prompt).toContain("(tanpa judul)");
    expect(prompt).toContain("santai");
    expect(prompt.endsWith("halo")).toBe(true);
  });
});
