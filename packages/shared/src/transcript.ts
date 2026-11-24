import { z } from "zod";

export const transcriptWordSchema = z.object({
  text: z.string(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  probability: z.number().min(0).max(1),
});
export type TranscriptWord = z.infer<typeof transcriptWordSchema>;

export const transcriptSegmentSchema = z.object({
  id: z.number().int().nonnegative(),
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string(),
  words: z.array(transcriptWordSchema),
});
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const transcriptSchema = z.object({
  language: z.string(),
  segments: z.array(transcriptSegmentSchema),
});
export type Transcript = z.infer<typeof transcriptSchema>;
