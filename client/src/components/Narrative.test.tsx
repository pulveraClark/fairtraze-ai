import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui/styles";
import { StatTile } from "./ui/StatTile";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
import { Narrative } from "./Narrative";

describe("Narrative", () => {
  it("has no button of its own; with nothing generated it points to Member contributions", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByRole("button", { name: /generate|regenerate/i })).toBeNull();
    expect(screen.getByText("No AI explanation yet. Use the Generate explanation button in Member contributions above.")).toBeTruthy();
    expect(BUTTON_SECONDARY).toContain("bg-white");
    expect(BUTTON_PRIMARY).toContain("bg-indigo-700");
  });
});

describe("Narrative outdated notice", () => {
  it("tells the instructor the results changed and keeps the saved text", () => {
    render(<Narrative narrative="Saved text." outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.getByText("Results changed. Generate a new explanation.")).toBeTruthy();
    expect(screen.getByText("Saved text.")).toBeTruthy();
  });

  it("shows no notice when the explanation is current or missing", () => {
    const { rerender } = render(<Narrative narrative="Saved text." projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Results changed/)).toBeNull();
    rerender(<Narrative narrative={null} outdated projectId={1} onNarrativeGenerated={() => {}} />);
    expect(screen.queryByText(/Results changed/)).toBeNull();
  });
});

describe("StatTile hero", () => {
  it("makes the value the largest text on the tile", () => {
    render(<StatTile hero label="Team health" value="Healthy" />);
    expect(screen.getByText("Healthy").className).toContain("text-3xl");
    render(<StatTile compact label="Members" value={3} />);
    expect(screen.getByText("3").className).toContain("text-xl");
  });
});
