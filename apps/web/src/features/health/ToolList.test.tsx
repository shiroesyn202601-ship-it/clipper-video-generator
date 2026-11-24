import type { ToolStatus } from "@clipper/shared";
import { render, screen } from "@testing-library/react";
import { ToolList } from "./ToolList.tsx";

const tools: ToolStatus[] = [
  { id: "ffmpeg", label: "ffmpeg", isAvailable: true, version: "7.1", detail: null },
  {
    id: "editly",
    label: "editly",
    isAvailable: false,
    version: null,
    detail: "Paket npm editly belum terpasang",
  },
];

describe("ToolList", () => {
  it("shows the version for available tools and the reason for missing ones", () => {
    render(<ToolList tools={tools} />);
    expect(screen.getByText("7.1")).toBeInTheDocument();
    expect(screen.getByText("Paket npm editly belum terpasang")).toBeInTheDocument();
  });

  it("announces availability to screen readers, not only by color", () => {
    render(<ToolList tools={tools} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Siap");
    expect(items[1]).toHaveTextContent("Belum ada");
  });
});
