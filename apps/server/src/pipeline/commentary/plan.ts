import { COMMENTARY_LIMITS } from "@clipper/shared";
import { z } from "zod";

export const COMMENTARY_SYSTEM_PROMPT = [
  "Kamu penulis komentar untuk kreator YouTube Shorts / TikTok Indonesia yang membuat klip dari podcast orang lain.",
  "Tugasmu memberi NILAI TAMBAH: sudut pandang, opini, atau alasan kenapa momen ini penting, dengan suara KREATOR (bukan narasumber).",
  "Aturan:",
  '- "intro": maksimal 14 kata. Memancing rasa penasaran tanpa membocorkan isi klip. Jangan mendeskripsikan apa yang terlihat di layar.',
  '- "outro": maksimal 28 kata. Opini atau insight kreator tentang isi klip, ditutup SATU pertanyaan untuk dijawab penonton di kolom komentar.',
  "- Jangan mengulang kalimat narasumber. Jangan minta like/subscribe. Jangan mengarang fakta, nama, atau angka yang tidak ada di transkrip.",
  "- Bahasa Indonesia lisan yang natural, tanpa emoji, tanpa tanda pagar.",
  'Balas HANYA JSON: {"intro": "...", "outro": "..."}',
].join("\n");

const DEFAULT_PERSONA = "santai, kritis, jujur, sedikit humor, seperti teman yang paham topiknya";

export function commentaryUserPrompt(options: {
  title: string | null;
  persona: string | undefined;
  transcript: string;
}): string {
  const trimmed = options.persona?.trim() ?? "";
  const persona = trimmed.length > 0 ? trimmed : DEFAULT_PERSONA;
  return [
    `Judul video sumber: ${options.title ?? "(tanpa judul)"}`,
    `Gaya bicara kreator: ${persona}`,
    "Transkrip klip:",
    options.transcript,
  ].join("\n");
}

/** Shortens text to `maxChars`, cutting at a sentence end or else a word boundary. */
export function clampText(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentenceEnd > maxChars * 0.5) return cut.slice(0, sentenceEnd + 1);
  const space = cut.lastIndexOf(" ");
  return (space > 0 ? cut.slice(0, space) : cut).replace(/[,;:]$/, "");
}

const planSchema = z.object({
  intro: z.string().default(""),
  outro: z.string().default(""),
});

/** Validates the model's JSON and keeps it within the commentary limits. */
export function parseCommentaryPlan(raw: unknown): { intro: string; outro: string } {
  const plan = planSchema.parse(raw);
  return {
    intro: clampText(plan.intro, COMMENTARY_LIMITS.introMaxChars),
    outro: clampText(plan.outro, COMMENTARY_LIMITS.outroMaxChars),
  };
}
