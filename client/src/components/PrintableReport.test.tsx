import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintableReport } from "./PrintableReport";
import { PrintableReportBundle } from "./PrintableReportBundle";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Ana Reyes", email: "ana@example.test", systemRole: "INSTRUCTOR" } }),
}));

const stored = (groupName: string) => ({
  groupName,
  repoUrl: null,
  analyzedAt: "2026-10-27T03:00:00Z",
  sourceType: "GITHUB",
  scoringConfig: null,
  report: { members: [], memberCount: 0, gini: 0, teamHealth: "Healthy" },
}) as never;

describe("printed report footer", () => {
  it("says who exported the report and when, on the page footer", () => {
    render(<PrintableReport stored={stored("Group 1")} narrative={null} assignmentLabel="CC — Subject" />);
    expect(screen.getByTestId("exported-by").textContent).toMatch(/^Exported by Ana Reyes, ana@example\.test, \d{4}-\d{2}-\d{2}$/);
  });

  it("a bundle of several reports prints the footer once (so it is not stacked)", () => {
    render(
      <PrintableReportBundle
        items={[
          { projectId: 1, stored: stored("Group 1"), narrative: null, assignmentLabel: "A" },
          { projectId: 2, stored: stored("Group 2"), narrative: null, assignmentLabel: "A" },
        ]}
      />,
    );
    expect(screen.getAllByTestId("exported-by")).toHaveLength(1);
  });
});
