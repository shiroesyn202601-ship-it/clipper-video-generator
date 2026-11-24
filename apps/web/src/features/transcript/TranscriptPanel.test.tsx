import type { TranscriptSegment } from "@clipper/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { findActiveSegment, TranscriptPanel } from "./TranscriptPanel.tsx";

const segments: TranscriptSegment[] = [
  { id: 0, startSec: 0, endSec: 4, text: "Pembuka acara.", words: [] },
  { id: 1, startSec: 5, endSec: 9, text: "Kenapa kita gagal?", words: [] },
  { id: 2, startSec: 10, endSec: 14, text: "Karena takut mencoba.", words: [] },
];

describe("findActiveSegment", () => {
  it.each([
    [-1, -1],
    [0, 0],
    [4.5, 0],
    [5, 1],
    [99, 2],
  ])("at %s s → segment %s", (time, expected) => {
    expect(findActiveSegment(segments, time)).toBe(expected);
  });
});

describe("TranscriptPanel", () => {
  it("seeks to a segment when clicked and marks the active one", async () => {
    const onSeek = vi.fn();
    render(<TranscriptPanel segments={segments} currentTimeSec={6} onSeek={onSeek} />);
    const active = screen.getByRole("button", { name: /Kenapa kita gagal/ });
    expect(active).toHaveAttribute("data-active", "true");
    await userEvent.click(screen.getByRole("button", { name: /Karena takut/ }));
    expect(onSeek).toHaveBeenCalledWith(10);
  });
});
