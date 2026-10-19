import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouterProvider } from "../router";
import { GroupSummaryCard } from "./GroupSummaryCard";
import type { ProjectSummaryItem } from "@shared/types";

const item = (names: string[]): ProjectSummaryItem => ({
  projectId: 1, groupName: "Group A", assignmentLabel: "X", classId: 1, assignmentId: 1, sourceType: "COMBINED",
  memberCount: names.length, teamHealth: "Healthy", gini: 0.1,
  memberShares: names.map((studentName) => ({ studentName, contributionShare: 1 / names.length, flags: [] })),
  flagsPresent: [], lastAnalyzedAt: "2026-10-19T00:00:00Z", isAnalyzed: true, membershipChangedAt: null, scoringConfigChangedAt: null,
  settingsOutdated: false,
} as ProjectSummaryItem);

function renderCard(names: string[]) {
  return render(
    <RouterProvider>
      <GroupSummaryCard item={item(names)} onAnalyze={() => {}} analyzing={false} onManage={() => {}} onTasks={() => {}} />
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
