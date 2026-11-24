import {
  DEFAULT_JOB_SETTINGS,
  MOMENT_WEIGHTS,
  jobSettingsSchema,
  type Transcript,
  type TranscriptWord,
} from "@clipper/shared";
import { describe, expect, it } from "vitest";
import { buildEnergyIndex, computeFeatures } from "./features.ts";
import {
  findMoments,
  generateWindows,
  scoreFeatures,
  selectNonOverlapping,
  topReasons,
} from "./find-moments.ts";
import { splitSentences } from "@clipper/shared";

const settings = jobSettingsSchema.parse({
  ...DEFAULT_JOB_SETTINGS,
  minClipSec: 5,
  targetClipSec: 6,
  maxClipSec: 10,
});

/** Builds words at a steady 2.5 words/s starting at `startSec`. */
function speak(text: string, startSec: number, probability = 0.95): TranscriptWord[] {
  return text.split(" ").map((word, index) => ({
    text: word,
    startSec: startSec + index * 0.4,
    endSec: startSec + index * 0.4 + 0.35,
    probability,
  }));
}

function transcriptOf(...parts: TranscriptWord[][]): Transcript {
  return {
    language: "id",
    segments: parts.map((words, id) => ({
      id,
      startSec: words[0]!.startSec,
      endSec: words.at(-1)!.endSec,
      text: words.map((word) => word.text).join(" "),
      words,
    })),
  };
}

describe("weights", () => {
  it("sum to 1 so scores stay within 0..100", () => {
    const total = Object.values(MOMENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("splitSentences", () => {
  it("splits on end punctuation and on long pauses", () => {
    const transcript = transcriptOf(
      speak("Halo semua. Apa kabar", 0),
      speak("kita mulai saja", 3), // pause > 0.7 s after "kabar"
    );
    expect(splitSentences(transcript).map((sentence) => sentence.text)).toEqual([
      "Halo semua.",
      "Apa kabar",
      "kita mulai saja",
    ]);
  });
});

describe("generateWindows", () => {
  it("only produces windows within the duration limits, on sentence boundaries", () => {
    const sentences = splitSentences(
      transcriptOf(
        speak("Satu dua tiga empat lima.", 0),
        speak("Enam tujuh delapan sembilan sepuluh.", 3.2),
      ),
    );
    const windows = generateWindows(sentences, settings);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.startSec).toBe(0);
    expect(windows[0]!.sentences).toHaveLength(2);
  });
});

describe("computeFeatures", () => {
  it("rewards a question opening and a complete ending", () => {
    const sentences = splitSentences(
      transcriptOf(
        speak("Kenapa bisnis kecil sering gagal?", 0),
        speak("Karena tidak punya rencana.", 2.4),
      ),
    );
    const features = computeFeatures(sentences, null, settings);
    expect(features.hook).toBe(1);
    expect(features.completeness).toBe(1);
    expect(features.speechDensity).toBe(1);
    expect(features.energy).toBe(0.5); // neutral without energy data
  });

  it("penalizes clips that start on a conjunction or stop mid-sentence", () => {
    const sentences = splitSentences(transcriptOf(speak("dan terus kita lanjut ke", 0)));
    expect(computeFeatures(sentences, null, settings).completeness).toBeCloseTo(0.21);
  });

  it("ranks loud passages higher than quiet ones", () => {
    const energy = buildEnergyIndex({ stepSec: 1, rmsDb: [-40, -40, -40, -10, -10, -10] });
    const quiet = splitSentences(transcriptOf(speak("Ini bagian yang pelan.", 0)));
    const loud = splitSentences(transcriptOf(speak("Ini bagian yang keras.", 3)));
    expect(computeFeatures(loud, energy, settings).energy).toBeGreaterThan(
      computeFeatures(quiet, energy, settings).energy,
    );
  });
});

describe("topReasons", () => {
  const strong = {
    hook: 1,
    energy: 0.9,
    speechDensity: 1,
    silence: 1,
    completeness: 1,
    durationFit: 1,
    confidence: 0.2,
  };

  it("keeps at most three passing features, hook first", () => {
    const reasons = topReasons(strong);
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toBe("Dibuka dengan pertanyaan");
    expect(reasons).not.toContain("Ucapan terdengar jelas");
  });

  it("prefers what sets the candidate apart from the others", () => {
    // Everyone has perfect pacing and complete sentences; only this one is loud.
    const means = { ...strong, energy: 0.4 };
    expect(topReasons(strong, means)[1]).toBe("Energi suara tinggi");
  });
});

describe("selectNonOverlapping", () => {
  it("keeps the best window and drops heavily overlapping ones", () => {
    const picked = selectNonOverlapping(
      [
        { startSec: 0, endSec: 10, score: 50 },
        { startSec: 1, endSec: 11, score: 80 },
        { startSec: 20, endSec: 30, score: 60 },
      ],
      5,
    );
    expect(picked.map((item) => item.score)).toEqual([80, 60]);
  });
});

describe("findMoments", () => {
  it("returns deterministic, ranked candidates with reasons", () => {
    const transcript = transcriptOf(
      speak("Kenapa kita takut gagal?", 0),
      speak("Karena kita lupa bahwa gagal itu guru.", 2),
      speak("Itu pelajaran penting.", 5.6),
      speak("Oke lanjut.", 30),
    );
    const first = findMoments(transcript, null, settings);
    const second = findMoments(transcript, null, settings);
    expect(first).toEqual(second);
    expect(first[0]?.startSec).toBe(0);
    expect(first[0]?.reasons).toContain("Dibuka dengan pertanyaan");
    expect(first[0]!.score).toBe(scoreFeatures(first[0]!.features as never));
  });
});
