import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { GroupSummaryCard } from "./GroupSummaryCard";
import type { ProjectSummaryItem } from "@shared/types";

const item = (names: string[], over: Partial<ProjectSummaryItem> = {}): ProjectSummaryItem => ({
  projectId: 1, groupName: "Group A", assignmentLabel: "X", classId: 1, assignmentId: 1, sourceType: "COMBINED",
  memberCount: names.length, teamHealth: "Healthy", gini: 0.1,
  memberShares: names.map((studentName) => ({ studentName, contributionShare: 1 / names.length, flags: [] })),
  flagsPresent: [], lastAnalyzedAt: "2026-10-19T00:00:00Z", isAnalyzed: true, membershipChangedAt: null, scoringConfigChangedAt: null,
  settingsOutdated: false,
  ...over,
} as ProjectSummaryItem);

function renderCard(names: string[], over: Partial<ProjectSummaryItem> = {}) {
  return render(
    <RouterProvider>
      <GroupSummaryCard item={item(names, over)} onAnalyze={() => {}} analyzing={false} onManage={() => {}} onTasks={() => {}} />
    </RouterProvider>,
  );
}

describe("GroupSummaryCard member legend", () => {
  it("tells members apart even when they share a first word", () => {
    renderCard(["UXA Leader", "UXA Member One", "UXA Member Two"]);
    expect(screen.getByText("UXA L.: 33%")).toBeInTheDocument();
    expect(screen.getByText("UXA O.: 33%")).toBeInTheDocument();
    expect(screen.getByText("UXA T.: 33%")).toBeInTheDocument();
  });
  it("keeps the full name as a tooltip", () => {
    renderCard(["Klent Sama", "Aldren Baricuatro"]);
    expect(screen.getByTitle("Aldren Baricuatro")).toHaveTextContent("Aldren B.: 50%");
  });
});

describe("GroupSummaryCard with no recorded activity", () => {
  const zero = (names: string[]) => names.map((studentName) => ({ studentName, contributionShare: 0, flags: ["inactive" as const] }));

  it("shows 'Not enough activity yet' instead of a health label and hides the inactive chips", () => {
    renderCard(["Ana Reyes", "Ben Cruz"], { teamHealth: "Healthy", memberShares: zero(["Ana Reyes", "Ben Cruz"]), flagsPresent: ["inactive"] });
    expect(screen.getByText("Not enough activity yet")).toBeInTheDocument();
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument();
    expect(screen.queryByText(/inactive/i)).not.toBeInTheDocument();
  });

  it("keeps the computed health and flags as soon as anyone has activity", () => {
    renderCard(["Ana Reyes", "Ben Cruz"], {
      teamHealth: "Moderate Risk",
      memberShares: [{ studentName: "Ana Reyes", contributionShare: 1, flags: [] }, { studentName: "Ben Cruz", contributionShare: 0, flags: ["inactive"] }],
      flagsPresent: ["inactive"],
    });
    expect(screen.queryByText("Not enough activity yet")).not.toBeInTheDocument();
    expect(screen.getByText("Moderate Risk")).toBeInTheDocument();
    expect(screen.getByText(/inactive/i)).toBeInTheDocument();
  });
});
