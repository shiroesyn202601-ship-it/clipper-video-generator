import type { StageState } from "@clipper/shared";
import { act, render, screen } from "@testing-library/react";
import { StageList } from "./StageList.tsx";

const START = "2026-01-01T00:00:00.000Z";

function stage(overrides: Partial<StageState>): StageState {
  return {
    status: "running",
    progress: 0.15,
    message: null,
    startedAt: START,
    finishedAt: null,
    ...overrides,
  };
}

describe("StageList elapsed time", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:06:06.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks every second while a stage runs, without new server data", () => {
    render(<StageList stages={[{ id: "transcribe", state: stage({}) }]} />);
    expect(screen.getByText("6:06")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("6:09")).toBeInTheDocument();
  });

  it("freezes at the finish time once a stage is done", () => {
    const done = stage({ status: "done", progress: 1, finishedAt: "2026-01-01T00:01:30.000Z" });
    render(<StageList stages={[{ id: "transcribe", state: done }]} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText("1:30")).toBeInTheDocument();
  });
});
