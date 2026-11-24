import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AppError, errorMessage, isAbortError } from "../lib/errors.ts";

/** Wait this long before reusing a rate-limited key when Groq gives no retry-after. */
const DEFAULT_COOLDOWN_MS = 60_000;
/** If every key is cooling down for longer than this, give up and fall back to local. */
const MAX_WAIT_MS = 90_000;
/** Attempts per chunk across all keys (rate limits, network errors, 5xx). */
const MAX_ATTEMPTS = 12;
const REQUEST_TIMEOUT_MS = 180_000;

/** "…abcd" — enough to tell keys apart in logs without leaking them. */
export function maskKey(key: string): string {
  return `…${key.slice(-4)}`;
}

/**
 * "retry-after: 7" or "7.5", or Groq's "x-ratelimit-reset-audio-seconds" style "2m59.5s" → ms.
 */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.ceil(Number(trimmed) * 1000);
  const match = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/.exec(trimmed);
  if (!match || trimmed.length === 0) return null;
  const [, h, m, s, ms] = match;
  const total =
    Number(h ?? 0) * 3_600_000 + Number(m ?? 0) * 60_000 + Number(s ?? 0) * 1000 + Number(ms ?? 0);
  return Number.isFinite(total) && total > 0 ? Math.ceil(total) : null;
}

export type KeyPick =
  | { kind: "key"; key: string }
  | { kind: "wait"; ms: number }
  | { kind: "none" };

/**
 * Round-robin over several Groq API keys. A key that hits its free-tier limit cools down
 * until Groq says it resets; a rejected key (401/403) is dropped until the server restarts.
 * State lives for the whole server process, so the next job skips keys that are exhausted.
 */
export class GroqKeyPool {
  readonly #keys: readonly string[];
  readonly #cooldownUntil = new Map<string, number>();
  readonly #rejected = new Set<string>();
  #cursor = 0;

  constructor(keys: readonly string[]) {
    this.#keys = keys;
  }

  get size(): number {
    return this.#keys.length;
  }

  get usableCount(): number {
    return this.#keys.filter((key) => !this.#rejected.has(key)).length;
  }

  pick(now = Date.now()): KeyPick {
    const usable = this.#keys.filter((key) => !this.#rejected.has(key));
    if (usable.length === 0) return { kind: "none" };
    for (let step = 0; step < this.#keys.length; step += 1) {
      const key = this.#keys[(this.#cursor + step) % this.#keys.length];
      if (key === undefined || this.#rejected.has(key)) continue;
      if ((this.#cooldownUntil.get(key) ?? 0) <= now) {
        this.#cursor = (this.#cursor + step + 1) % this.#keys.length;
        return { kind: "key", key };
      }
    }
    const soonest = Math.min(...usable.map((key) => this.#cooldownUntil.get(key) ?? now));
    return { kind: "wait", ms: Math.max(0, soonest - now) };
  }

  coolDown(key: string, ms: number, now = Date.now()): void {
    this.#cooldownUntil.set(key, now + ms);
  }

  reject(key: string): void {
    this.#rejected.add(key);
  }
}

const pools = new Map<string, GroqKeyPool>();

/** One pool per distinct key list, shared by every job in this server process. */
export function getKeyPool(keys: readonly string[]): GroqKeyPool {
  const id = keys.join(",");
  let pool = pools.get(id);
  if (!pool) {
    pool = new GroqKeyPool(keys);
    pools.set(id, pool);
  }
  return pool;
}

function groqError(code: string, message: string, userMessage: string, cause?: unknown): AppError {
  return new AppError({ code, message, userMessage, cause });
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

type GroqRequestOptions = {
  pool: GroqKeyPool;
  signal: AbortSignal;
  log: (line: string) => Promise<void>;
  /** Short name for logs (file name, "commentary"). */
  label: string;
  /** User-facing word for what was rejected on a 4xx, e.g. "audio". */
  subject: string;
  /** Sends the request with one key; must honour the given signal. */
  send: (key: string, signal: AbortSignal) => Promise<Response>;
};

/** Seconds until the first exhausted Groq limit resets (audio, tokens, or requests). */
function cooldownMs(headers: Headers): number {
  return (
    parseRetryAfter(headers.get("retry-after")) ??
    parseRetryAfter(headers.get("x-ratelimit-reset-audio-seconds")) ??
    parseRetryAfter(headers.get("x-ratelimit-reset-tokens")) ??
    parseRetryAfter(headers.get("x-ratelimit-reset-requests")) ??
    DEFAULT_COOLDOWN_MS
  );
}

/**
 * Runs one Groq API call with key rotation: 429 parks the key until its limit resets and
 * tries the next one, 401/403 drops the key, 5xx and network errors retry with backoff.
 * Returns the parsed JSON body of the first successful response.
 */
async function requestWithRotation(options: GroqRequestOptions): Promise<unknown> {
  const { pool, signal, log, label } = options;
  let lastProblem = "unknown error";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    signal.throwIfAborted();
    const pick = pool.pick();
    if (pick.kind === "none") {
      throw groqError(
        "GROQ_KEYS_REJECTED",
        "All Groq API keys were rejected (401/403)",
        "Semua API key Groq ditolak. Periksa GROQ_API_KEYS di .env",
      );
    }
    if (pick.kind === "wait") {
      if (pick.ms > MAX_WAIT_MS) {
        throw groqError(
          "GROQ_QUOTA_EXHAUSTED",
          `Every Groq key is rate limited for at least ${Math.round(pick.ms / 1000)}s`,
          "Kuota gratis semua API key Groq sedang habis",
        );
      }
      await log(`[groq] all keys rate limited, waiting ${Math.ceil(pick.ms / 1000)}s`);
      await sleep(pick.ms, signal);
      continue;
    }

    const key = pick.key;
    let response: Response;
    try {
      response = await options.send(
        key,
        AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      );
    } catch (error) {
      if (signal.aborted) throw error;
      lastProblem = isAbortError(error) ? "request timed out" : errorMessage(error);
      await log(`[groq] ${label} key ${maskKey(key)}: network error: ${lastProblem}`);
      await sleep(Math.min(2000 * attempt, 10_000), signal);
      continue;
    }

    if (response.ok) {
      await log(`[groq] ${label} done with key ${maskKey(key)}`);
      const body: unknown = await response.json();
      return body;
    }

    const body = (await response.text().catch(() => "")).slice(0, 300);
    lastProblem = `HTTP ${response.status}: ${body}`;
    await log(`[groq] ${label} key ${maskKey(key)}: ${lastProblem}`);

    if (response.status === 401 || response.status === 403) {
      pool.reject(key);
      continue;
    }
    if (response.status === 429) {
      pool.coolDown(key, cooldownMs(response.headers));
      continue;
    }
    if (response.status >= 500) {
      await sleep(Math.min(2000 * attempt, 10_000), signal);
      continue;
    }
    // 400 / 413 and similar: retrying with another key will not help.
    throw groqError(
      "GROQ_REQUEST_FAILED",
      `Groq rejected ${label}: ${lastProblem}`,
      `Groq menolak ${options.subject} (HTTP ${response.status})`,
    );
  }

  throw groqError(
    "GROQ_UNAVAILABLE",
    `Groq failed after ${MAX_ATTEMPTS} attempts: ${lastProblem}`,
    "Groq tidak bisa dihubungi",
  );
}

/**
 * Sends one audio file to Groq's OpenAI-compatible transcription endpoint and returns the
 * parsed `verbose_json` body (word + segment timestamps).
 */
export async function transcribeWithGroq(options: {
  pool: GroqKeyPool;
  baseUrl: string;
  model: string;
  filePath: string;
  /** ISO 639-1 code, or "auto" to let Whisper detect it. */
  language: string;
  signal: AbortSignal;
  log: (line: string) => Promise<void>;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const audio = await readFile(options.filePath);
  const fileName = path.basename(options.filePath);
  return requestWithRotation({
    pool: options.pool,
    signal: options.signal,
    log: options.log,
    label: fileName,
    subject: "audio",
    send: (key, signal) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)]), fileName);
      form.append("model", options.model);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");
      form.append("temperature", "0");
      if (options.language !== "auto") form.append("language", options.language);
      return fetchImpl(`${options.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal,
      });
    },
  });
}

const chatResponseSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

/**
 * Asks a Groq chat model for a JSON object (response_format json_object) and returns it
 * parsed. The prompt must mention JSON, as the API requires.
 */
export async function groqChatJson(options: {
  pool: GroqKeyPool;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
  temperature: number;
  signal: AbortSignal;
  log: (line: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = await requestWithRotation({
    pool: options.pool,
    signal: options.signal,
    log: options.log,
    label: "chat",
    subject: "permintaan AI",
    send: (key, signal) =>
      fetchImpl(`${options.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
        }),
        signal,
      }),
  });
  const content = chatResponseSchema.parse(body).choices[0]?.message.content ?? "";
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed;
  } catch (error) {
    throw groqError(
      "GROQ_BAD_JSON",
      `Groq chat returned invalid JSON: ${content.slice(0, 200)}`,
      "Jawaban AI tidak bisa dibaca. Coba lagi.",
      error,
    );
  }
}
