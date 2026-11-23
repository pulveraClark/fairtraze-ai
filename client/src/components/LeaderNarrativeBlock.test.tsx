import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LeaderNarrativeBlock, LEADER_OUTDATED_TEXT } from "./LeaderNarrativeBlock";

describe("LeaderNarrativeBlock", () => {
  it("up to date: shows the text and no notice", () => {
    render(<LeaderNarrativeBlock narrative="Ana wrote the API." outdated={false} />);
    expect(screen.getByText("Ana wrote the API.")).toBeTruthy();
    expect(screen.queryByText(LEADER_OUTDATED_TEXT)).toBeNull();
  });

  it("carries no AI pill and no disclaimer of its own (the card shows one pill and one note)", () => {
    render(<LeaderNarrativeBlock narrative="Ana wrote the API." outdated={false} />);
    expect(screen.queryByText("AI findings")).toBeNull();
    expect(screen.queryByText(/May be wrong|Informational only|Based on the analysis/)).toBeNull();
  });

  it("out of date: only the notice shows; the previous text is one click away and can be hidden again", async () => {
    render(<LeaderNarrativeBlock narrative="Ana wrote the API." outdated />);
    expect(screen.getByRole("status")).toHaveTextContent("May be out of date. Your instructor can refresh it.");
    expect(screen.queryByText(/regenerate|Generate again/i)).toBeNull();
    expect(screen.queryByText("Ana wrote the API.")).toBeNull();
    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: "Show previous text" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText("Ana wrote the API.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide previous text" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Hide previous text" }));
    expect(screen.queryByText("Ana wrote the API.")).toBeNull();
  });
});
