export type AppErrorOptions = {
  code: string;
  /** English, for logs. */
  message: string;
  /** Indonesian, shown in the UI. */
  userMessage: string;
  statusCode?: number;
  cause?: unknown;
};

/** Domain error with a stable code and a user-facing message. */
export class AppError extends Error {
  readonly code: string;
  readonly userMessage: string;
  readonly statusCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.statusCode = options.statusCode ?? 500;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
