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

  it("out of date: only the notice shows; the previous text is one click away and can be hidden again", async () => {
    render(<LeaderNarrativeBlock narrative="Ana wrote the API." outdated />);
    expect(screen.getByRole("status")).toHaveTextContent("Out of date. Your instructor can regenerate it.");
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
