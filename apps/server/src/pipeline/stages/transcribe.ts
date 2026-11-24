import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveInside, toJobRelative, writeJsonAtomic } from "../../lib/fs-utils.ts";
import { runFfmpeg } from "../../tools/ffmpeg.ts";
import { transcribeWav } from "../../tools/whisper.ts";
import { normalizeWhisper, whisperRawSchema } from "../transcript/normalize.ts";
import type { AnalysisStage } from "../stage.ts";
import { cleanVocalsArtifact } from "./artifacts.ts";

/** Share of the stage progress used by the 16 kHz conversion. */
const CONVERT_SHARE = 0.05;

export const transcribeStage: AnalysisStage = {
  id: "transcribe",
  run: async (context) => {
    const job = context.job();
    const vocals = resolveInside(context.jobDir, cleanVocalsArtifact(job));
    const audio16k = path.join(context.jobDir, "audio", "audio16k.wav");
    const transcriptDir = path.join(context.jobDir, "transcript");
    await mkdir(transcriptDir, { recursive: true });

    // whisper.cpp requires 16 kHz mono 16-bit PCM.
    await runFfmpeg({
      config: context.config,
      args: ["-i", vocals, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"],
      outputPath: audio16k,
      durationSec: job.durationSec ?? 0,
      onProgress: (fraction) => context.reportProgress(fraction * CONVERT_SHARE),
      signal: context.signal,
      logFile: context.logFile,
      errorCode: "AUDIO_CONVERT_FAILED",
      userMessage: "Audio tidak bisa disiapkan untuk transkrip. Lihat log.",
    });
    await context.setArtifacts({ audio16k: toJobRelative(context.jobDir, audio16k) });

    context.reportProgress(CONVERT_SHARE, "Mentranskrip");
    const rawPath = await transcribeWav({
      config: context.config,
      wavPath: audio16k,
      outputBase: path.join(transcriptDir, "raw"),
      language: job.settings.language,
      signal: context.signal,
      logFile: context.logFile,
      onProgress: (fraction) =>
        context.reportProgress(CONVERT_SHARE + fraction * (1 - CONVERT_SHARE), "Mentranskrip"),
    });

    const raw = await readJson(rawPath, whisperRawSchema);
    const transcript = normalizeWhisper(raw, job.settings.language);
    const transcriptPath = path.join(transcriptDir, "transcript.json");
    await writeJsonAtomic(transcriptPath, transcript);
    await context.setArtifacts({ transcript: toJobRelative(context.jobDir, transcriptPath) });
  },
};
