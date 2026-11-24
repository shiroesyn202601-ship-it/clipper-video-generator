import { z } from "zod";

export const TOOL_IDS = [
  "ffmpeg",
  "ffprobe",
  "yt-dlp",
  "deno",
  "whisper",
  "whisper-model",
  "python",
  "demucs",
  "deepfilternet",
  "opencv",
  "norfair",
  "face-model",
  "editly",
] as const;
export type ToolId = (typeof TOOL_IDS)[number];

export const toolStatusSchema = z.object({
  id: z.enum(TOOL_IDS),
  label: z.string(),
  isAvailable: z.boolean(),
  version: z.string().nullable(),
  detail: z.string().nullable(),
});
export type ToolStatus = z.infer<typeof toolStatusSchema>;

export const healthReportSchema = z.object({
  isReady: z.boolean(),
  tools: z.array(toolStatusSchema),
});
export type HealthReport = z.infer<typeof healthReportSchema>;
