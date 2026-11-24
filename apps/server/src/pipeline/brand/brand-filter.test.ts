import path from "node:path";
import { brandKitSchema, isBrandActive } from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { buildBrandGraph, overlayPosition, tintFilterExpression } from "./brand-filter.ts";

describe("overlayPosition", () => {
  it("maps grid positions to overlay coordinates", () => {
    expect(overlayPosition("tl", 40)).toEqual(["40", "40"]);
    expect(overlayPosition("br", 40)).toEqual(["main_w-overlay_w-40", "main_h-overlay_h-40"]);
    expect(overlayPosition("c", 0)).toEqual(["(main_w-overlay_w)/2", "(main_h-overlay_h)/2"]);
  });
});

describe("brand kit", () => {
  it("is off by default, so old clips render unchanged", () => {
    const brand = brandKitSchema.parse({});
    expect(brand.enabled).toBe(false);
    expect(isBrandActive(brand)).toBe(false);
    expect(isBrandActive({ ...brand, enabled: true })).toBe(false);
  });

  it("stacks overlays first and the logo on top", () => {
    const brand = brandKitSchema.parse({
      enabled: true,
      logo: { file: "logo-abcd1234.png", position: "tr", size: 20, opacity: 0.5 },
      overlays: [
        { id: "sub", file: "overlay-1234abcd.webm", show: "last", seconds: 4, chromaKey: true },
      ],
    });
    const graph = buildBrandGraph({
      brand,
      brandDir: "brand",
      width: 1080,
      durationSec: 30,
      fps: 30,
      firstInput: 2,
      inputLabel: "[captioned]",
    });
    expect(graph.inputs).toEqual([
      "-c:v",
      "libvpx-vp9",
      "-stream_loop",
      "-1",
      "-i",
      path.join("brand", "overlay-1234abcd.webm"),
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      path.join("brand", "logo-abcd1234.png"),
    ]);
    expect(graph.filters[0]).toBe(
      "[2:v]colorkey=0x00FF00:0.30:0.10,scale=324:-2,fps=30,format=rgba[brand0]",
    );
    expect(graph.filters[1]).toContain("enable='gte(t,26.00)'");
    expect(graph.filters[2]).toBe(
      "[3:v]scale=216:-2,fps=30,format=rgba,colorchannelmixer=aa=0.50[brand1]",
    );
    expect(graph.outputLabel).toBe("[branded1]");
  });
});

describe("tintFilterExpression", () => {
  it("fades the colour from the bottom edge", () => {
    const expression = tintFilterExpression({
      enabled: true,
      color: "#102030",
      opacity: 0.6,
      style: "bottom",
      reach: 50,
    });
    expect(expression).toBe(
      "format=rgba,geq=r=16:g=32:b=48:a=153.0*clip((Y/H-(1-0.500))/0.500\\,0\\,1)",
    );
  });
});
