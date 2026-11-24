import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Transcript } from "@clipper/shared";
import { AppError, errorMessage } from "../../lib/errors.ts";
import { readJson, resolveInside, toJobRelative, writeJsonAtomic } from "../../lib/fs-utils.ts";
import { runFfmpeg } from "../../tools/ffmpeg.ts";
import { transcribeWav } from "../../tools/whisper.ts";
import { normalizeWhisper, whisperRawSchema } from "../transcript/normalize.ts";
import type { AnalysisStage, StageContext } from "../stage.ts";
import { cleanVocalsArtifact } from "./artifacts.ts";
import { transcribeOnline } from "./transcribe-online.ts";

/** Share of the stage progress used by the 16 kHz conversion. */
const CONVERT_SHARE = 0.05;

const ONLINE_DONE_MESSAGE = "Ditranskrip online (Groq)";

async function transcribeLocal(
  context: StageContext,
  audio16k: string,
  language: string,
  onProgress: (fraction: number) => void,
): Promise<Transcript> {
  const rawPath = await transcribeWav({
    config: context.config,
    wavPath: audio16k,
    outputBase: path.join(context.jobDir, "transcript", "raw"),
    language,
    signal: context.signal,
    logFile: context.logFile,
    onProgress,
  });
  const raw = await readJson(rawPath, whisperRawSchema);
  return normalizeWhisper(raw, language);
}

export const transcribeStage: AnalysisStage = {
  id: "transcribe",
  run: async (context) => {
    const job = context.job();
    const { language } = job.settings;
    const vocals = resolveInside(context.jobDir, cleanVocalsArtifact(job));
    const audio16k = path.join(context.jobDir, "audio", "audio16k.wav");
    const transcriptDir = path.join(context.jobDir, "transcript");
    await mkdir(transcriptDir, { recursive: true });

    // whisper.cpp requires 16 kHz mono 16-bit PCM; Groq pieces are cut from the same file.
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

    const progress =
      (message: string) =>
      (fraction: number): void =>
        context.reportProgress(CONVERT_SHARE + fraction * (1 - CONVERT_SHARE), message);

    let transcript: Transcript | null = null;
    let doneMessage: string | undefined;
    if (job.settings.onlineTranscribe) {
      if (context.config.groq.apiKeys.length === 0) {
        doneMessage = "GROQ_API_KEYS belum diisi, ditranskrip dengan whisper lokal";
      } else {
        const message = "Mentranskrip online (Groq)";
        context.reportProgress(CONVERT_SHARE, message);
        try {
          transcript = await transcribeOnline(context, audio16k, language, progress(message));
          doneMessage = ONLINE_DONE_MESSAGE;
        } catch (error) {
          if (context.signal.aborted) throw error;
          const reason = error instanceof AppError ? error.userMessage : "Groq gagal";
          await appendFile(
            context.logFile,
            `[groq] falling back to whisper.cpp: ${errorMessage(error)}\n`,
            "utf8",
          );
          doneMessage = `${reason}, ditranskrip dengan whisper lokal`;
          context.reportProgress(CONVERT_SHARE, `${reason}. Pindah ke whisper lokal`);
        }
      }
    }

    transcript ??= await transcribeLocal(context, audio16k, language, progress("Mentranskrip"));

    const transcriptPath = path.join(transcriptDir, "transcript.json");
    await writeJsonAtomic(transcriptPath, transcript);
    await context.setArtifacts({ transcript: toJobRelative(context.jobDir, transcriptPath) });
    if (doneMessage) context.setDoneMessage?.(doneMessage);
  },
};
