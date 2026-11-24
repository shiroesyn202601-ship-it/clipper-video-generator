import {
  appSettingsSchema,
  healthReportSchema,
  jobSchema,
  jobSummarySchema,
  candidatesFileSchema,
  clipSchema,
  transcriptSchema,
  type AppSettings,
  type CandidatesFile,
  type UpdateAppSettingsBody,
  type Clip,
  type CreateClipBody,
  type UpdateClipBody,
  type Transcript,
  type CreateJobBody,
  type HealthReport,
  type Job,
  type JobSettingsInput,
  type JobSummary,
} from "@clipper/shared";
import { z } from "zod";
import { copy } from "./copy.ts";

const API_BASE = "/api";

const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** Error returned by the local server; `message` is already user-facing Indonesian text. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

type RequestOptions<T extends z.ZodTypeAny> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  schema: T;
  signal?: AbortSignal;
};

async function request<T extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions<T>,
): Promise<z.infer<T>> {
  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.signal) init.signal = options.signal;
  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("NETWORK_ERROR", copy.errors.serverUnreachable, 0);
  }

  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiError("HTTP_ERROR", copy.errors.unexpected, response.status);
  }
  return options.schema.parse(payload) as z.infer<T>;
}

const noContentSchema = z.null();

function clipPath(jobId: string, clipId: string): string {
  return `/jobs/${encodeURIComponent(jobId)}/clips/${encodeURIComponent(clipId)}`;
}

export const api = {
  getHealth: (signal?: AbortSignal): Promise<HealthReport> =>
    request("/health", { schema: healthReportSchema, ...(signal ? { signal } : {}) }),

  listJobs: (signal?: AbortSignal): Promise<JobSummary[]> =>
    request("/jobs", { schema: z.array(jobSummarySchema), ...(signal ? { signal } : {}) }),

  getJob: (jobId: string, signal?: AbortSignal): Promise<Job> =>
    request(`/jobs/${encodeURIComponent(jobId)}`, {
      schema: jobSchema,
      ...(signal ? { signal } : {}),
    }),

  createJob: (body: CreateJobBody): Promise<Job> =>
    request("/jobs", { method: "POST", body, schema: jobSchema }),

  cancelJob: (jobId: string): Promise<Job> =>
    request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", schema: jobSchema }),

  skipStage: (jobId: string, stageId: string): Promise<Job> =>
    request(`/jobs/${encodeURIComponent(jobId)}/stages/${encodeURIComponent(stageId)}/skip`, {
      method: "POST",
      schema: jobSchema,
    }),

  retryJob: (jobId: string): Promise<Job> =>
    request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", schema: jobSchema }),

  deleteJob: async (jobId: string): Promise<void> => {
    await request(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
      schema: noContentSchema,
    });
  },

  getTranscript: (jobId: string, signal?: AbortSignal): Promise<Transcript> =>
    request(`/jobs/${encodeURIComponent(jobId)}/transcript`, {
      schema: transcriptSchema,
      ...(signal ? { signal } : {}),
    }),

  getCandidates: (jobId: string, signal?: AbortSignal): Promise<CandidatesFile> =>
    request(`/jobs/${encodeURIComponent(jobId)}/candidates`, {
      schema: candidatesFileSchema,
      ...(signal ? { signal } : {}),
    }),

  createClip: (jobId: string, body: CreateClipBody): Promise<Clip> =>
    request(`/jobs/${encodeURIComponent(jobId)}/clips`, {
      method: "POST",
      body,
      schema: clipSchema,
    }),

  updateClip: (jobId: string, clipId: string, body: UpdateClipBody): Promise<Clip> =>
    request(clipPath(jobId, clipId), { method: "PATCH", body, schema: clipSchema }),

  renderClip: (jobId: string, clipId: string): Promise<Clip> =>
    request(`${clipPath(jobId, clipId)}/render`, { method: "POST", schema: clipSchema }),

  cancelClip: async (jobId: string, clipId: string): Promise<void> => {
    await request(`${clipPath(jobId, clipId)}/cancel`, { method: "POST", schema: noContentSchema });
  },

  revealClip: async (jobId: string, clipId: string): Promise<void> => {
    await request(`${clipPath(jobId, clipId)}/reveal`, { method: "POST", schema: noContentSchema });
  },

  deleteClip: async (jobId: string, clipId: string): Promise<void> => {
    await request(clipPath(jobId, clipId), { method: "DELETE", schema: noContentSchema });
  },

  getSettings: (signal?: AbortSignal): Promise<AppSettings> =>
    request("/settings", { schema: appSettingsSchema, ...(signal ? { signal } : {}) }),

  updateSettings: (body: UpdateAppSettingsBody): Promise<AppSettings> =>
    request("/settings", { method: "PATCH", body, schema: appSettingsSchema }),

  /** Font name → downloaded (SETUP.md step 5c). */
  getFonts: (signal?: AbortSignal): Promise<Record<string, boolean>> =>
    request("/fonts", { schema: z.record(z.boolean()), ...(signal ? { signal } : {}) }),

  fontUrl: (file: string): string => `${API_BASE}/fonts/${encodeURIComponent(file)}`,

  transcriptVttUrl: (jobId: string): string =>
    `${API_BASE}/jobs/${encodeURIComponent(jobId)}/transcript.vtt`,

  jobEventsUrl: (jobId: string): string => `${API_BASE}/jobs/${encodeURIComponent(jobId)}/events`,

  /** URL of a file inside the job folder, e.g. "source/source.mp4". */
  mediaUrl: (jobId: string, relativePath: string): string =>
    `${API_BASE}/jobs/${encodeURIComponent(jobId)}/media/${relativePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,

  /** Upload uses XMLHttpRequest because fetch cannot report upload progress. */
  uploadJob: (options: {
    file: File;
    settings: JobSettingsInput;
    onProgress: (fraction: number) => void;
    signal?: AbortSignal;
  }): Promise<Job> =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("settings", JSON.stringify(options.settings)); // must precede the file
      form.append("file", options.file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/jobs/upload`);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) options.onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        const payload: unknown = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(jobSchema.parse(payload));
          return;
        }
        const parsed = apiErrorBodySchema.safeParse(payload);
        reject(
          parsed.success
            ? new ApiError(parsed.data.error.code, parsed.data.error.message, xhr.status)
            : new ApiError("HTTP_ERROR", copy.errors.unexpected, xhr.status),
        );
      };
      xhr.onerror = () => reject(new ApiError("NETWORK_ERROR", copy.errors.serverUnreachable, 0));
      options.signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(form);
    }),
};

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : copy.errors.unexpected;
}
