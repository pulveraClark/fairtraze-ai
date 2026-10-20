import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui/styles";
import { StatTile } from "./ui/StatTile";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));
import { Narrative } from "./Narrative";

describe("Narrative", () => {
  it("Generate explanation is a secondary button, so Re-analyze stays the only filled button on the report", () => {
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} />);
    const btn = screen.getByRole("button", { name: "Generate explanation" });
    expect(btn.className).toContain("bg-white");
    expect(btn.className).not.toContain("bg-indigo-700");
    expect(BUTTON_SECONDARY).toContain("bg-white");
    expect(BUTTON_PRIMARY).toContain("bg-indigo-700");
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
