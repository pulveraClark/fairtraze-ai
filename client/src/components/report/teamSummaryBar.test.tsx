import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamSummaryBar, flaggedText } from "./TeamSummaryBar";
import { EARLY_DATA_SENTENCE } from "../EarlyDataTag";
import { HEALTHY_GINI_THRESHOLD, MODERATE_RISK_GINI_THRESHOLD } from "@shared/scoring";

const base = { noActivity: false, teamHealth: "Healthy" as const, gini: 0.122, earlyMuted: false, confidence: "high" as const, flaggedCount: 0, averageGini: null };

describe("TeamSummaryBar", () => {
  it("is one row: label, health, Gini with a real (i) button, and the flagged count", () => {
    render(<TeamSummaryBar {...base} />);
    expect(screen.getByText("Team health")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText(/Gini 0\.122/)).toBeInTheDocument();
    expect(screen.getByText("0 members flagged")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About the Gini coefficient and team health" }).getAttribute("aria-expanded")).toBe("false");
    expect(flaggedText(1)).toBe("1 member flagged");
    expect(flaggedText(3)).toBe("3 members flagged");
  });

  it("shows the Early data tag only when data is early, and the long sentence only inside the popover", async () => {
    const { rerender } = render(<TeamSummaryBar {...base} />);
    expect(screen.queryByText("Early data")).toBeNull();
    rerender(<TeamSummaryBar {...base} confidence="low" earlyMuted />);
    expect(screen.getByRole("button", { name: /Early data/ })).toBeInTheDocument();
    expect(screen.queryByText(EARLY_DATA_SENTENCE)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "About the Gini coefficient and team health" }));
    expect(screen.getByText(EARLY_DATA_SENTENCE)).toBeInTheDocument();
  });

  it("the tag opens the same popover, Esc closes it and returns focus to the tag", async () => {
    render(<TeamSummaryBar {...base} confidence="medium" averageGini={0.2} />);
    const tag = screen.getByRole("button", { name: /Early data/ });
    await userEvent.click(tag);
    expect(tag.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Average for other groups in this assignment: 0\.200/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(EARLY_DATA_SENTENCE)).toBeNull();
    expect(document.activeElement).toBe(tag);
  });

  it("no activity: no Gini and no flagged count", () => {
    render(<TeamSummaryBar {...base} noActivity />);
    expect(screen.queryByText(/Gini/)).toBeNull();
    expect(screen.queryByText(/flagged/)).toBeNull();
  });

  it("the popover is titled 'How team health is read', lists the three bands from the constants and marks this group's", async () => {
    render(<TeamSummaryBar {...base} teamHealth="Moderate Risk" gini={0.3} />);
    await userEvent.click(screen.getByRole("button", { name: "About the Gini coefficient and team health" }));
    expect(screen.getByText("How team health is read")).toBeInTheDocument();
    expect(screen.getByText("Gini shows how evenly the work is shared. 0 means perfectly equal.")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    const text = items.map((li) => li.textContent ?? "");
    expect(text).toHaveLength(3);
    expect(text[0]).toBe(`Healthy: Gini below ${HEALTHY_GINI_THRESHOLD}`);
    expect(text[1]).toBe(`✓Moderate risk: ${HEALTHY_GINI_THRESHOLD} to below ${MODERATE_RISK_GINI_THRESHOLD} (this group)`);
    expect(text[2]).toBe(`High risk: ${MODERATE_RISK_GINI_THRESHOLD} or above`);
    expect(screen.getByText("Informational only. The instructor decides.")).toBeInTheDocument();
  });
});
