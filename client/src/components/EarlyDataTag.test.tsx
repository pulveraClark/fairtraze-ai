import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import { EarlyDataTag, EARLY_DATA_TEXT } from "./EarlyDataTag";
import { FlagTag } from "./FlagTag";
import { StatusPill } from "./ui";
import { earlyDataFlagsNote } from "../lib/studentDisplay";
import { TIPS } from "../lib/helpText";

describe("EarlyDataTag", () => {
  it("low and medium both read just 'Early data'", () => {
    const { rerender } = render(<EarlyDataTag level="low" />);
    expect(screen.getByText("Early data")).toBeInTheDocument();
    expect(screen.queryByText(/too early to tell/)).toBeNull();
    rerender(<EarlyDataTag level="medium" />);
    expect(screen.getByText("Early data")).toBeInTheDocument();
    expect(screen.queryByText(/too early to tell/)).toBeNull();
  });

  it("with a popover it is one real button that reports its expanded state and calls onToggle", async () => {
    const onToggle = vi.fn();
    render(<EarlyDataTag level="low" popover={{ expanded: false, onToggle }} />);
    const btn = screen.getByRole("button", { name: "About early data" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.textContent).toBe("Early data");
    expect(btn.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(btn.className).toContain("min-h-10");
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("high, no activity and unknown show nothing at all", () => {
    for (const level of ["high", "final", null, undefined] as const) {
      const { container, unmount } = render(<EarlyDataTag level={level} />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("never prints a day count or a number", () => {
    for (const t of Object.values(EARLY_DATA_TEXT)) expect(t).not.toMatch(/\d/);
  });

  it("the help text states the rule from the constants and names the most active member", () => {
    expect(TIPS.earlyData).toContain("most active member");
    expect(TIPS.earlyData).toContain("fewer than 15 active days");
    expect(TIPS.earlyData).toContain("fewer than 5 reads 'too early to tell'");
    expect(TIPS.earlyData).toContain("before the project deadline");
    expect(TIPS.earlyData.length).toBeLessThanOrEqual(240);
  });
});

describe("muted flags and health keep their words", () => {
  it("StatusPill flag and health: same label, grey tone, when muted", () => {
    const { rerender } = render(<StatusPill kind="flag" value="free-rider" muted />);
    const pill = screen.getByText("Free-rider");
    expect(pill.className).toContain("bg-slate-100");
    expect(pill.className).not.toContain("bg-red-100");
    rerender(<StatusPill kind="health" value="High Risk" muted />);
    expect(screen.getByText("High risk").className).toContain("bg-slate-100");
    rerender(<StatusPill kind="flag" value="free-rider" />);
    expect(screen.getByText("Free-rider").className).toContain("bg-red-100");
  });

  it("FlagTag: a student's own early flag is plain grey with the same wording", () => {
    render(<FlagTag flag="free-rider" view="own" muted />);
    const tag = screen.getByText("Low contribution");
    expect(tag.className).toContain("bg-slate-100");
    expect(tag.className).not.toContain("amber");
  });
});

describe("student wording on early data", () => {
  it("is calm, never accusatory, and never mentions Gini, bands or an index", () => {
    for (const level of ["low", "medium"] as const) {
      const note = earlyDataFlagsNote(level)!;
      expect(note).toMatch(/may change/);
      expect(note).not.toMatch(/gini|band|index|free-rider|inactive|blame|fault|should/i);
    }
    expect(earlyDataFlagsNote("high")).toBeNull();
    expect(earlyDataFlagsNote("final")).toBeNull();
    expect(earlyDataFlagsNote(null)).toBeNull();
    for (const t of [...Object.values(EARLY_DATA_TEXT), TIPS.earlyData]) expect(t).not.toMatch(/gini/i);
  });
});
