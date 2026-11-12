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

const withMembers = (over: Record<string, unknown> = {}) => ({
  groupName: "Group 1",
  repoUrl: "https://github.com/acme/app",
  analyzedAt: "2026-10-27T03:00:00Z",
  sourceType: "COMBINED",
  evidenceReportId: null,
  scoringConfig: {
    weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
    thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
    blend: { wGitHub: 0.5, wDocs: 0.5 },
  },
  report: { members: [], memberCount: 0, gini: 0.1, teamHealth: "Healthy", deadlineWindowBasis: "activity-span" },
  ...over,
}) as never;

describe("printed instructor export", () => {
  it("shows the class label it is given and never the 'General Assignment' placeholder", () => {
    render(<PrintableReport stored={withMembers()} narrative={null} assignmentLabel="CC-APPSDEV22 · Applications Development — Capstone" />);
    expect(screen.getAllByText("CC-APPSDEV22 · Applications Development — Capstone").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("General Assignment");
  });

  it("uses the FAIRTRAZE spelling, including the source label", () => {
    render(<PrintableReport stored={withMembers()} narrative={null} assignmentLabel="X" />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("FAIRTRAZE AI");
    expect(text).toContain("GitHub + FAIRTRAZE Collaborative Editor");
    expect(text).not.toMatch(/FAIR TRAZE|FairTraze/);
    expect(screen.getByAltText("FAIRTRAZE AI")).toBeTruthy();
  });

  it("prints a legend with all four flag rules (from the stored thresholds), the Gini bands and the column meanings", () => {
    render(<PrintableReport stored={withMembers()} narrative={null} assignmentLabel="X" />);
    const legend = screen.getByTestId("export-legend").textContent ?? "";
    for (const name of ["Inactive", "Free-rider", "Overload", "Deadline-driven"]) expect(legend).toContain(name);
    expect(legend).toContain("below 0.5× the equal share");
    expect(legend).toContain("above 1.75× the equal share");
    expect(legend).toContain("GitHub share");
    expect(legend).toContain("Combined share");
    expect(document.body.textContent).toContain("Moderate risk: 0.2 to below 0.4");
  });

  it("shows the Report ID in the footer and summary when one exists for that analysis", () => {
    render(<PrintableReport stored={withMembers({ evidenceReportId: "FT-7K2P-9X" })} narrative={null} assignmentLabel="X" />);
    expect(screen.getByTestId("footer-report-id").textContent).toBe("FT-7K2P-9X");
    expect(screen.getByText("Report ID")).toBeTruthy();
  });

  it("shows no Report ID anywhere when none exists", () => {
    render(<PrintableReport stored={withMembers()} narrative={null} assignmentLabel="X" />);
    expect(screen.queryByTestId("footer-report-id")).toBeNull();
    expect(screen.queryByText("Report ID")).toBeNull();
    expect(document.body.textContent).not.toMatch(/FT-[A-Z0-9]{4}-[A-Z0-9]{2}/);
  });

  it("carries the clean-print rules: portrait paper that follows the printer, margins, page numbers, repeating header", () => {
    const { container } = render(<PrintableReport stored={withMembers()} narrative={null} assignmentLabel="X" />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("size: portrait");
    expect(css).not.toMatch(/size:\s*A4/);
    expect(css).toContain("margin: 16mm 14mm 22mm 14mm");
    expect(css).toContain('"Page " counter(page) " of " counter(pages)');
    expect(css).toContain("thead { display: table-header-group; }");
    expect(css).toContain("break-inside: avoid");
  });

  it("a bulk export keeps each report's own ID in its summary and leaves it out of the shared footer", () => {
    render(
      <PrintableReportBundle
        items={[
          { projectId: 1, stored: withMembers({ evidenceReportId: "FT-AAAA-AA" }), narrative: null, assignmentLabel: "A" },
          { projectId: 2, stored: withMembers({ evidenceReportId: "FT-BBBB-BB" }), narrative: null, assignmentLabel: "A" },
        ]}
      />,
    );
    expect(screen.queryByTestId("footer-report-id")).toBeNull();
    expect(screen.getByText("FT-AAAA-AA")).toBeTruthy();
    expect(screen.getByText("FT-BBBB-BB")).toBeTruthy();
  });
});

