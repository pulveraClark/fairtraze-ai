import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiBadge } from "./AiBadge";

describe("AiBadge", () => {
  it("ai: indigo pill with visible text and a decorative icon", () => {
    const { container } = render(<AiBadge variant="ai" />);
    const pill = screen.getByText("AI summary");
    expect(pill.className).toContain("bg-indigo-100");
    expect(pill.className).toContain("text-indigo-900");
    expect(pill.className).toContain("flex-wrap");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("ai: the label can be 'AI explanation'", () => {
    render(<AiBadge variant="ai" label="AI explanation" />);
    expect(screen.getByText("AI explanation")).toBeTruthy();
  });

  it("facts: grey pill 'Changed files only', and the AI label never appears", () => {
    render(<AiBadge variant="facts" label="AI summary" />);
    const pill = screen.getByText("Changed files only");
    expect(pill.className).toContain("bg-slate-100");
    expect(pill.className).not.toContain("indigo");
    expect(screen.queryByText(/AI summary/)).toBeNull();
  });

  it("writing: pill with a spinner and the helper text", () => {
    const { container } = render(<AiBadge variant="writing" />);
    expect(screen.getByRole("status").textContent).toBe("AI summary · writing…");
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
    expect(screen.getByText("This takes about a minute. You can keep using the page.")).toBeTruthy();
  });
});
