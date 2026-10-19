import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClassCard, classAtRiskCount } from "./ClassCard";
import { RouterProvider } from "../router";
import { ClassContainerCard } from "./ClassContainerCard";
import type { ProjectSummaryItem } from "@shared/types";

const group = (id: number, shares: number[], over: Partial<ProjectSummaryItem> = {}): ProjectSummaryItem => ({
  projectId: id, groupName: `G${id}`, assignmentLabel: "X", classId: 1, assignmentId: 1, sourceType: "GITHUB",
  memberCount: shares.length, teamHealth: "Healthy", gini: 0, isAnalyzed: true, lastAnalyzedAt: "2026-10-19T00:00:00Z",
  memberShares: shares.map((s, i) => ({ studentName: `M${i}`, contributionShare: s, flags: [] })),
  flagsPresent: [], membershipChangedAt: null, scoringConfigChangedAt: null, settingsOutdated: false, ...over,
} as ProjectSummaryItem);

// two empty groups (one carries a stale "High Risk" label and an inactive flag) and one healthy group
const items = [
  group(1, [0, 0], { teamHealth: "High Risk", flagsPresent: ["inactive"] }),
  group(2, [0, 0, 0], { flagsPresent: ["inactive"] }),
  group(3, [0.5, 0.5]),
];

describe("instructor roll-ups with zero-activity groups", () => {
  it("class card: its own neutral line, not counted as risk", () => {
    render(<ClassCard assignmentLabel="CODE — Subject" items={items} onClick={() => {}} />);
    expect(screen.getByText("2 groups: no activity yet")).toBeInTheDocument();
    expect(screen.getByText(/1 Healthy/)).toBeInTheDocument();
    expect(screen.queryByText(/High Risk/)).not.toBeInTheDocument();
    expect(screen.queryByText(/at risk/i)).not.toBeInTheDocument();
    expect(classAtRiskCount(items)).toBe(0);
  });

  it("singular wording for one group", () => {
    render(<ClassCard assignmentLabel="CODE — Subject" items={[group(1, [0, 0])]} onClick={() => {}} />);
    expect(screen.getByText("1 group: no activity yet")).toBeInTheDocument();
  });

  it("class container card: same line, no attention badge", () => {
    render(<RouterProvider><ClassContainerCard assignmentLabel="CODE — Subject" items={items} expanded={false} onToggle={() => {}} onAnalyze={() => {}} analyzingIds={new Set()} /></RouterProvider>);
    expect(screen.getByText("2 groups: no activity yet")).toBeInTheDocument();
    expect(screen.queryByText(/attention/i)).not.toBeInTheDocument();
  });
});
