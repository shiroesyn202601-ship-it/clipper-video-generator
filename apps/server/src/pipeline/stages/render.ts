import { existsSync } from "node:fs";
import { appendFile, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CAPTION_FONTS,
  RENDER_SETTINGS,
  hasCommentary,
  isBrandActive,
  type BrandKit,
  type CaptionStyle,
} from "@clipper/shared";
import type { Config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import { toJobRelative } from "../../lib/fs-utils.ts";
import { probeMedia, runFfmpeg } from "../../tools/ffmpeg.ts";
import { readAppSettings } from "../../settings/settings-store.ts";
import { buildBrandGraph, tintFilterExpression } from "../brand/brand-filter.ts";
import { buildAss } from "../captions/ass.ts";
import { buildStyledAss } from "../captions/styled-ass.ts";
import { buildCommentaryTimeline } from "../commentary/timeline.ts";
import type { ClipStage, ClipStageContext } from "../stage.ts";

/** Allowed difference between the rendered and the requested clip length (seconds). */
const DURATION_TOLERANCE_SEC = 0.5;

/**
 * Copies the caption font next to captions.ass so libass finds it through a relative
 * `fontsdir` (no Windows path escaping inside the filter). Returns the filter option, or ""
 * when the font is a system font or not downloaded (libass then falls back to another font).
 */
async function prepareFont(
  config: Config,
  style: CaptionStyle,
  clipDir: string,
  logFile: string,
): Promise<string> {
  const file = CAPTION_FONTS[style.font];
  if (file === null) return "";
  const fontsDir = path.join(clipDir, "fonts");
  await mkdir(fontsDir, { recursive: true });
  try {
    await copyFile(path.join(config.fontsDir, file), path.join(fontsDir, file));
    return ":fontsdir=fonts";
  } catch {
    await mkdir(path.dirname(logFile), { recursive: true });
    await appendFile(
      logFile,
      `[render] font ${file} not found in ${config.fontsDir}; libass uses a fallback font (SETUP.md 5c)
`,
      "utf8",
    );
    return "";
  }
}

/** Drops brand files that were deleted from disk, so a missing logo never fails a render. */
function withExistingFiles(brand: BrandKit, brandDir: string): BrandKit {
  const exists = (file: string): boolean => existsSync(path.join(brandDir, file));
  return {
    ...brand,
    logo: { ...brand.logo, file: brand.logo.file && exists(brand.logo.file) ? brand.logo.file : null },
    overlays: brand.overlays.filter((overlay) => exists(overlay.file)),
  };
}

/**
 * Inputs + filter_complex with the brand kit: tint under the captions, then overlays and
 * the logo on top. Input 0 = reframed video, 1 = audio, 2 = tint image (if any), then brand files.
 */
async function brandVideoArgs(
  context: ClipStageContext,
  brand: BrandKit,
  subtitles: string,
  durationSec: number,
): Promise<string[]> {
  const inputs: string[] = [];
  const filters: string[] = [];
  let current = "[0:v]";
  let nextInput = 2;
  if (brand.tint.enabled) {
    const tintPath = path.join(context.clipDir, "tint.png");
    await runFfmpeg({
      config: context.config,
      args: [
        "-f",
        "lavfi",
        "-i",
        `color=c=black:s=${RENDER_SETTINGS.width}x${RENDER_SETTINGS.height}`,
        "-frames:v",
        "1",
        "-vf",
        tintFilterExpression(brand.tint),
        "-update",
        "1",
      ],
      outputPath: tintPath,
      durationSec: 0,
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "RENDER_FAILED",
      userMessage: "Lapisan warna (tint) brand kit gagal dibuat. Lihat log.",
    });
    inputs.push("-loop", "1", "-framerate", String(RENDER_SETTINGS.fps), "-i", "tint.png");
    filters.push(`[0:v][${nextInput}:v]overlay=0:0:shortest=1:format=auto[tinted]`);
    current = "[tinted]";
    nextInput += 1;
  }
  filters.push(`${current}${subtitles}[captioned]`);
  const graph = buildBrandGraph({
    brand,
    brandDir: context.config.brandDir,
    width: RENDER_SETTINGS.width,
    durationSec,
    fps: RENDER_SETTINGS.fps,
    firstInput: nextInput,
    inputLabel: "[captioned]",
  });
  return [
    ...inputs,
    ...graph.inputs,
    "-filter_complex",
    [...filters, ...graph.filters].join(";"),
    "-map",
    graph.outputLabel,
    "-map",
    "1:a:0",
  ];
}

export const renderStage: ClipStage = {
  id: "render",
  run: async (context) => {
    const job = context.job();
    const clip = context.clip();
    let durationSec = clip.endSec - clip.startSec;
    let videoInput = "reframed.mp4";
    let audioInput = "audio.wav";
    let captions = clip.captions;
    // Commentary (intro/outro) turns the clip into a longer timeline; without it the inputs
    // are the same as before the feature existed.
    if (hasCommentary(clip.commentary)) {
      const timeline = await buildCommentaryTimeline(
        context,
        clip.commentary,
        clip.captions,
        durationSec,
      );
      videoInput = timeline.file;
      audioInput = timeline.file;
      captions = timeline.captions;
      durationSec = timeline.durationSec;
    }

    const size = { width: RENDER_SETTINGS.width, height: RENDER_SETTINGS.height };
    // Clips without a caption style keep the legacy look, so older clips render unchanged.
    const ass = clip.captionStyle
      ? buildStyledAss(captions, { style: clip.captionStyle, ...size })
      : buildAss(captions, { style: job.settings.subtitleStyle, ...size });
    const fontOption = clip.captionStyle
      ? await prepareFont(context.config, clip.captionStyle, context.clipDir, context.logFile)
      : "";
    await writeFile(path.join(context.clipDir, "captions.ass"), ass, "utf8");

    const subtitles = `ass=captions.ass${fontOption}`;
    const brand = withExistingFiles(
      (await readAppSettings(context.config.workspaceDir)).brand,
      context.config.brandDir,
    );
    // Without an active brand kit the command is exactly the pre-brand one.
    const videoArgs =
      clip.useBrand && isBrandActive(brand)
        ? await brandVideoArgs(context, brand, subtitles, durationSec)
        : ["-map", "0:v:0", "-map", "1:a:0", "-vf", subtitles];

    const outputPath = path.join(context.clipDir, "final.mp4");
    await runFfmpeg({
      config: context.config,
      // Relative names + cwd: the "ass" filter argument then needs no Windows path escaping.
      cwd: context.clipDir,
      args: [
        "-i",
        videoInput,
        "-i",
        audioInput,
        ...videoArgs,
        "-r",
        String(RENDER_SETTINGS.fps),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
      ],
      outputPath,
      durationSec,
      onProgress: (fraction) => context.reportProgress(fraction, "Merender"),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "RENDER_FAILED",
      userMessage: "Render klip gagal. Lihat log.",
    });

    const media = await probeMedia(context.config, outputPath);
    if (
      !media.hasVideo ||
      !media.hasAudio ||
      Math.abs(media.durationSec - durationSec) > DURATION_TOLERANCE_SEC
    ) {
      throw new AppError({
        code: "RENDER_INVALID",
        message: `final.mp4 check failed: video=${media.hasVideo} audio=${media.hasAudio} duration=${media.durationSec} expected=${durationSec}`,
        userMessage: "Hasil render tidak lengkap. Coba render ulang.",
      });
    }
    await context.updateClip((draft) => {
      draft.output = toJobRelative(context.jobDir, outputPath);
    });
  },
};
