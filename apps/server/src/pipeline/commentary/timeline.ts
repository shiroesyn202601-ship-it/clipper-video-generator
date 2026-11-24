import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RENDER_SETTINGS, type Caption, type ClipCommentary } from "@clipper/shared";
import { z } from "zod";
import { probeMedia, runFfmpeg } from "../../tools/ffmpeg.ts";
import { runWorker } from "../../tools/worker.ts";
import { buildCaptions } from "../captions/build-captions.ts";
import type { ClipStageContext } from "../stage.ts";

/** Silence before the voice starts and after it ends in an intro/outro segment (seconds). */
export const LEAD_SEC = 0.15;
export const TAIL_SEC = 0.45;

const ttsResultSchema = z.object({
  audio: z.string(),
  words: z.array(z.object({ text: z.string(), startSec: z.number(), endSec: z.number() })),
});
type TtsWord = z.infer<typeof ttsResultSchema>["words"][number];

export type CommentaryPart = {
  name: "intro" | "outro";
  /** Relative to the clip folder. */
  audio: string;
  words: TtsWord[];
  durationSec: number;
};

export type Timeline = {
  /** Relative to the clip folder; holds both the video and the audio track. */
  file: string;
  captions: Caption[];
  durationSec: number;
};

/** Captions for spoken commentary, shifted to where its segment starts on the timeline. */
export function commentaryCaptions(words: readonly TtsWord[], offsetSec: number): Caption[] {
  const shifted = words.map((word) => ({
    text: word.text,
    startSec: offsetSec + LEAD_SEC + word.startSec,
    endSec: offsetSec + LEAD_SEC + word.endSec,
    probability: 1,
  }));
  return buildCaptions(shifted, 0);
}

/** Moves clip captions later by `offsetSec` (the intro length). */
export function shiftCaptions(captions: readonly Caption[], offsetSec: number): Caption[] {
  return captions.map((caption) => ({
    ...caption,
    startSec: caption.startSec + offsetSec,
    endSec: caption.endSec + offsetSec,
  }));
}

const AUDIO_FORMAT = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";

/**
 * filter_complex for [intro] + clip + [outro]. Input 0 = reframed video, 1 = clip audio,
 * then for each part: its still image (looped) and its voice.
 */
export function timelineFilter(options: {
  parts: readonly CommentaryPart[];
  mainDurationSec: number;
  width: number;
  height: number;
  fps: number;
}): string {
  const { width, height, fps } = options;
  const video = `scale=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
  const filters: string[] = [
    `[0:v]${video}[vmain]`,
    `[1:a]${AUDIO_FORMAT},apad,atrim=0:${options.mainDurationSec.toFixed(3)}[amain]`,
  ];
  const segments: Record<string, string> = {};
  options.parts.forEach((part, index) => {
    const still = 2 + index * 2;
    const voice = still + 1;
    const delayMs = Math.round(LEAD_SEC * 1000);
    filters.push(
      `[${still}:v]scale=${width}:${height},boxblur=22:2,eq=brightness=-0.13:saturation=0.8,setsar=1,fps=${fps},format=yuv420p[v${part.name}]`,
      `[${voice}:a]${AUDIO_FORMAT},adelay=${delayMs}|${delayMs},apad,atrim=0:${part.durationSec.toFixed(3)}[a${part.name}]`,
    );
    segments[part.name] = `[v${part.name}][a${part.name}]`;
  });
  const order = [segments.intro, "[vmain][amain]", segments.outro].filter(
    (segment): segment is string => segment !== undefined,
  );
  filters.push(`${order.join("")}concat=n=${order.length}:v=1:a=1[vout][aout]`);
  return filters.join(";");
}

async function speak(
  context: ClipStageContext,
  name: "intro" | "outro",
  text: string,
  voice: string,
): Promise<CommentaryPart> {
  const dir = path.join(context.clipDir, "commentary");
  await mkdir(dir, { recursive: true });
  const textFile = path.join(dir, `${name}.txt`);
  await writeFile(textFile, text, "utf8");
  const outputs = await runWorker({
    config: context.config,
    module: "tts",
    args: ["--input", textFile, "--output", dir, "--voice", voice, "--name", name],
    signal: context.signal,
    logFile: context.logFile,
    errorCode: "COMMENTARY_TTS_FAILED",
    userMessages: {
      default:
        "Suara komentar (Edge-TTS) gagal dibuat. Periksa koneksi internet, lalu render ulang.",
      EDGE_TTS_MISSING:
        "Paket edge-tts belum terpasang. Jalankan ulang pip install -r workers/requirements.txt.",
    },
  });
  const result = ttsResultSchema.parse(outputs);
  const audioPath = path.join(dir, `${name}.mp3`);
  const media = await probeMedia(context.config, audioPath);
  return {
    name,
    audio: path.relative(context.clipDir, audioPath),
    words: result.words,
    durationSec: LEAD_SEC + media.durationSec + TAIL_SEC,
  };
}

async function extractStill(context: ClipStageContext, name: string, fromEnd: boolean) {
  await runFfmpeg({
    config: context.config,
    cwd: context.clipDir,
    args: [
      ...(fromEnd ? ["-sseof", "-0.3"] : []),
      "-i",
      "reframed.mp4",
      "-frames:v",
      "1",
      "-update",
      "1",
    ],
    outputPath: path.join(context.clipDir, "commentary", `${name}.png`),
    durationSec: 0,
    signal: context.signal,
    logFile: context.logFile,
    errorCode: "COMMENTARY_STILL_FAILED",
    userMessage: "Frame untuk komentar gagal diambil. Lihat log.",
  });
}

/**
 * Builds commentary/timeline.mkv = [intro] + clip + [outro]: each commentary segment is the
 * first/last frame of the clip, blurred and darkened, with the AI voice over it. Returns the
 * captions for the whole timeline (commentary text + the clip captions shifted).
 */
export async function buildCommentaryTimeline(
  context: ClipStageContext,
  commentary: ClipCommentary,
  captions: readonly Caption[],
  mainDurationSec: number,
): Promise<Timeline> {
  const parts: CommentaryPart[] = [];
  if (commentary.intro.trim()) {
    context.reportProgress(0.02, "Suara komentar pembuka");
    parts.push(await speak(context, "intro", commentary.intro.trim(), commentary.voice));
    await extractStill(context, "intro", false);
  }
  if (commentary.outro.trim()) {
    context.reportProgress(0.04, "Suara komentar penutup");
    parts.push(await speak(context, "outro", commentary.outro.trim(), commentary.voice));
    await extractStill(context, "outro", true);
  }

  const intro = parts.find((part) => part.name === "intro");
  const outro = parts.find((part) => part.name === "outro");
  const introSec = intro?.durationSec ?? 0;
  const durationSec = introSec + mainDurationSec + (outro?.durationSec ?? 0);
  const inputs = parts.flatMap((part) => [
    "-loop",
    "1",
    "-framerate",
    String(RENDER_SETTINGS.fps),
    "-t",
    part.durationSec.toFixed(3),
    "-i",
    path.join("commentary", `${part.name}.png`),
    "-i",
    part.audio,
  ]);

  context.reportProgress(0.05, "Menyusun komentar + klip");
  const file = path.join("commentary", "timeline.mkv");
  await runFfmpeg({
    config: context.config,
    cwd: context.clipDir,
    args: [
      "-i",
      "reframed.mp4",
      "-i",
      "audio.wav",
      ...inputs,
      "-filter_complex",
      timelineFilter({
        parts,
        mainDurationSec,
        width: RENDER_SETTINGS.width,
        height: RENDER_SETTINGS.height,
        fps: RENDER_SETTINGS.fps,
      }),
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "16",
      "-c:a",
      "pcm_s16le",
    ],
    outputPath: path.join(context.clipDir, file),
    durationSec,
    signal: context.signal,
    logFile: context.logFile,
    errorCode: "COMMENTARY_TIMELINE_FAILED",
    userMessage: "Komentar gagal digabung dengan klip. Lihat log.",
  });

  return {
    file,
    durationSec,
    captions: [
      ...(intro ? commentaryCaptions(intro.words, 0) : []),
      ...shiftCaptions(captions, introSec),
      ...(outro ? commentaryCaptions(outro.words, introSec + mainDurationSec) : []),
    ],
  };
}
