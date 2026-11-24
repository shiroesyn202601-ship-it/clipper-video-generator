import { z } from "zod";

/** Indonesian Edge-TTS voices (Microsoft, free). */
export const COMMENTARY_VOICES = {
  "id-ID-ArdiNeural": "Ardi (pria)",
  "id-ID-GadisNeural": "Gadis (wanita)",
} as const;
export type CommentaryVoice = keyof typeof COMMENTARY_VOICES;
const VOICE_IDS = Object.keys(COMMENTARY_VOICES) as [CommentaryVoice, ...CommentaryVoice[]];

export const COMMENTARY_LIMITS = { introMaxChars: 160, outroMaxChars: 280 } as const;

/**
 * Creator commentary around a clip: an intro before it and an outro after it, read by an AI
 * voice over a blurred still of the clip, with the text as captions. It adds the creator's
 * own view, which platforms count as added value. null on clips without commentary.
 */
export const clipCommentarySchema = z.object({
  enabled: z.boolean().default(true),
  intro: z.string().max(COMMENTARY_LIMITS.introMaxChars).default(""),
  outro: z.string().max(COMMENTARY_LIMITS.outroMaxChars).default(""),
  voice: z.enum(VOICE_IDS).default("id-ID-ArdiNeural"),
});
export type ClipCommentary = z.infer<typeof clipCommentarySchema>;

export function hasCommentary(commentary: ClipCommentary | null): commentary is ClipCommentary {
  return (
    commentary !== null &&
    commentary.enabled &&
    (commentary.intro.trim().length > 0 || commentary.outro.trim().length > 0)
  );
}

export const generateCommentaryBodySchema = z.object({
  /** Speaking style of the creator, e.g. "santai, kritis, sedikit humor". */
  persona: z.string().max(200).optional(),
});
export type GenerateCommentaryBody = z.infer<typeof generateCommentaryBodySchema>;
