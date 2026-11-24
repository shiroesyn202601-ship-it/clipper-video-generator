import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Transcript } from "@clipper/shared";
import { z } from "zod";
import { readJson, writeJsonAtomic } from "../../lib/fs-utils.ts";
import { probeMedia, runFfmpeg } from "../../tools/ffmpeg.ts";
import { getKeyPool, transcribeWithGroq } from "../../tools/groq.ts";
import { runProcess } from "../../tools/run-process.ts";
import type { StageContext } from "../stage.ts";
import {
  groqRawSchema,
  normalizeGroq,
  parseSilences,
  planChunks,
  type GroqChunk,
} from "../transcript/groq.ts";

/**
 * 10-minute pieces: as 16 kHz mono FLAC they stay well under Groq's 25 MB free-tier upload
 * limit, and a failed request only repeats one piece.
 */
const CHUNK_TARGET_SEC = 600;
const CHUNK_SEARCH_SEC = 60;

const planSchema = z.object({
  sourceDurationSec: z.number(),
  chunks: z.array(z.object({ startSec: z.number(), endSec: z.number() })),
});

/**
 * Transcribes `audio16k` with Groq's free Whisper API. Each piece's response is cached in
 * transcript/groq/, so a retry after a quota or network error only sends what is missing.
 */
export async function transcribeOnline(
  context: StageContext,
  audio16k: string,
  language: string,
  onProgress: (fraction: number) => void,
): Promise<Transcript> {
  const { config, signal, logFile } = context;
  const groqDir = path.join(context.jobDir, "transcript", "groq");
  await mkdir(groqDir, { recursive: true });
  await mkdir(path.dirname(logFile), { recursive: true });
  const log = async (line: string): Promise<void> => {
    await appendFile(logFile, `${line}\n`, "utf8");
  };

  const { durationSec } = await probeMedia(config, audio16k);
  const planPath = path.join(groqDir, "plan.json");
  let plan = await readJson(planPath, planSchema).catch(() => null);
  if (!plan || Math.abs(plan.sourceDurationSec - durationSec) > 0.5) {
    const stderr: string[] = [];
    await runProcess({
      command: config.bins.ffmpeg,
      args: [
        "-hide_banner",
        "-nostdin",
        "-i",
        audio16k,
        "-af",
        "silencedetect=noise=-35dB:d=0.3",
        "-f",
        "null",
        "-",
      ],
      signal,
      onStderrLine: (line) => {
        if (line.includes("silence_")) stderr.push(line);
      },
    });
    plan = {
      sourceDurationSec: durationSec,
      chunks: planChunks(durationSec, parseSilences(stderr), CHUNK_TARGET_SEC, CHUNK_SEARCH_SEC),
    };
    await writeJsonAtomic(planPath, plan);
  }
  const pool = getKeyPool(config.groq.apiKeys);
  await log(`[groq] ${plan.chunks.length} piece(s), ${pool.usableCount} usable key(s)`);
  const results: GroqChunk[] = [];
  for (const [index, range] of plan.chunks.entries()) {
    const name = `chunk-${String(index).padStart(3, "0")}`;
    const jsonPath = path.join(groqDir, `${name}.json`);
    let raw = await readJson(jsonPath, groqRawSchema).catch(() => null);
    if (!raw) {
      const flacPath = path.join(groqDir, `${name}.flac`);
      await runFfmpeg({
        config,
        args: [
          "-ss",
          String(range.startSec),
          "-t",
          String(range.endSec - range.startSec),
          "-i",
          audio16k,
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "flac",
        ],
        outputPath: flacPath,
        durationSec: range.endSec - range.startSec,
        signal,
        logFile,
        errorCode: "AUDIO_CONVERT_FAILED",
        userMessage: "Audio tidak bisa dipotong untuk transkrip online. Lihat log.",
      });
      const body = await transcribeWithGroq({
        pool,
        baseUrl: config.groq.baseUrl,
        model: config.groq.model,
        filePath: flacPath,
        language,
        signal,
        log,
      });
      raw = groqRawSchema.parse(body);
      await writeJsonAtomic(jsonPath, raw);
    }
    results.push({ offsetSec: range.startSec, raw });
    onProgress((index + 1) / plan.chunks.length);
  }

  return normalizeGroq(results, language);
}
