import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  clipCommentarySchema,
  transcriptSchema,
  type Clip,
  type GenerateCommentaryBody,
} from "@clipper/shared";
import type { Config } from "../config.ts";
import { AppError } from "../lib/errors.ts";
import { wordsInRange } from "../pipeline/captions/build-captions.ts";
import {
  COMMENTARY_SYSTEM_PROMPT,
  commentaryUserPrompt,
  parseCommentaryPlan,
} from "../pipeline/commentary/plan.ts";
import { getKeyPool, groqChatJson } from "../tools/groq.ts";
import type { ClipService } from "./clip-service.ts";
import type { JobService } from "./job-service.ts";
import type { JobStore } from "./job-store.ts";

/** Upper bound for one commentary request, including waiting for a rate-limited key. */
const GENERATE_TIMEOUT_MS = 120_000;

/**
 * Writes the AI creator commentary for a clip with a Groq chat model (free tier). The text
 * is saved on the clip, where the user can edit it before rendering.
 */
export class CommentaryService {
  readonly #config: Config;
  readonly #store: JobStore;
  readonly #jobs: JobService;
  readonly #clips: ClipService;

  constructor(config: Config, store: JobStore, jobs: JobService, clips: ClipService) {
    this.#config = config;
    this.#store = store;
    this.#jobs = jobs;
    this.#clips = clips;
  }

  async generate(jobId: string, clipId: string, body: GenerateCommentaryBody): Promise<Clip> {
    if (this.#config.groq.apiKeys.length === 0) {
      throw new AppError({
        code: "GROQ_NOT_CONFIGURED",
        message: "GROQ_API_KEYS is empty",
        userMessage: "Komentar AI butuh API key Groq. Isi GROQ_API_KEYS di .env (SETUP.md 4b).",
        statusCode: 400,
      });
    }
    const job = this.#store.get(jobId);
    const clip = job.clips.find((item) => item.id === clipId);
    if (!clip) {
      throw new AppError({
        code: "CLIP_INVALID",
        message: `Clip not found: ${clipId}`,
        userMessage: "Klip tidak ditemukan.",
        statusCode: 404,
      });
    }
    const transcript = await this.#jobs.readArtifact(jobId, "transcript", transcriptSchema);
    const spoken = wordsInRange(transcript, clip.startSec, clip.endSec)
      .map((word) => word.text)
      .join(" ");

    const logFile = path.join(this.#store.jobDir(jobId), "logs", "commentary.log");
    await mkdir(path.dirname(logFile), { recursive: true });
    const raw = await groqChatJson({
      pool: getKeyPool(this.#config.groq.apiKeys),
      baseUrl: this.#config.groq.baseUrl,
      model: this.#config.groq.chatModel,
      system: COMMENTARY_SYSTEM_PROMPT,
      user: commentaryUserPrompt({ title: job.title, persona: body.persona, transcript: spoken }),
      temperature: 0.8,
      signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS),
      log: (line) => appendFile(logFile, `${line}\n`, "utf8"),
    });
    const plan = parseCommentaryPlan(raw);
    const commentary = clipCommentarySchema.parse({
      ...(clip.commentary ?? {}),
      enabled: true,
      intro: plan.intro,
      outro: plan.outro,
    });
    return this.#clips.update(jobId, clipId, { commentary });
  }
}
