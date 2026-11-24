import type { z } from "zod";
import { AppError } from "../lib/errors.ts";

/** Parses untrusted input with a zod schema or throws a 400 AppError. */
export function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data as z.infer<T>;
  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  throw new AppError({
    code: "VALIDATION_FAILED",
    message: `${where}${issue?.message ?? "invalid input"}`,
    userMessage: "Data yang dikirim tidak valid.",
    statusCode: 400,
  });
}
