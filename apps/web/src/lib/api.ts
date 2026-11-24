import {
  healthReportSchema,
  jobSchema,
  jobSummarySchema,
  type CreateJobBody,
  type HealthReport,
  type Job,
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

  retryJob: (jobId: string): Promise<Job> =>
    request(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST", schema: jobSchema }),

  deleteJob: async (jobId: string): Promise<void> => {
    await request(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
      schema: noContentSchema,
    });
  },

  jobEventsUrl: (jobId: string): string => `${API_BASE}/jobs/${encodeURIComponent(jobId)}/events`,
};

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : copy.errors.unexpected;
}
