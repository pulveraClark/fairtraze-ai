import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { EvidenceReportDto } from "@shared/evidenceReport";
import { EvidenceSheet } from "./EvidenceSheet";
import { tableNote } from "../lib/evidenceText";

function dto(over: Partial<EvidenceReportDto> = {}): EvidenceReportDto {
  return {
    collegeName: "College of Computer Studies",
    groupName: "Group 1",
    className: "IT-ELEC 2 \u00B7 Electives",
    projectTitle: "Capstone Project",
    repoUrl: "https://github.com/acme/app",
    analyzedAt: "2026-11-10T02:00:00.000Z",
    generatedAt: "2026-11-12T07:05:00.000Z",
    sourceType: "COMBINED",
    weights: { githubPct: 50, docsPct: 50 },
    memberCount: 3,
    equalSharePct: 33.3,
    members: [
      { name: "Ana Cruz", githubPct: 50, docsPct: 20, combinedPct: 35, flags: [] },
      { name: "Ben Reyes", githubPct: 30, docsPct: 60, combinedPct: 45, flags: ["overload"] },
      { name: "Cai Tan", githubPct: 20, docsPct: 20, combinedPct: 20, flags: ["free-rider", "deadline-driven"] },
    ],
    leaderName: "Ana Cruz",
    reportId: "FT-7K2P-9X",
    ...over,
  };
}

describe("EvidenceSheet", () => {
  it("prints the header, the info block and the Report ID", () => {
    render(<EvidenceSheet dto={dto()} />);
    expect(screen.getByText("University of Cebu \u2013 Lapu-Lapu and Mandaue")).toBeTruthy();
    expect(screen.getByText("College of Computer Studies")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Contribution Evidence Report" })).toBeTruthy();
    expect(screen.getByText("Group 1")).toBeTruthy();
    for (const label of ["Class:", "Project:", "Repository:", "Analyzed:", "Generated:", "Sources:", "Report ID:"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("GitHub + FAIRTRAZE Collaborative Editor")).toBeTruthy();
    const id = screen.getByText("FT-7K2P-9X");
    expect(id.style.fontWeight).toBe("700");
  });

  it("shows real flag names or None, and Combined in bold", () => {
    render(<EvidenceSheet dto={dto()} />);
    const rows = within(screen.getAllByRole("table")[1]).getAllByRole("row"); // [0] is the header; the first table is the info block
    expect(within(rows[1]).getByText("None")).toBeTruthy();
    expect(within(rows[2]).getByText("overload")).toBeTruthy();
    expect(within(rows[3]).getByText("free-rider, deadline-driven")).toBeTruthy();
    expect(within(rows[1]).getByText("35%").style.fontWeight).toBe("700");
  });

  it("shows only the source columns that apply", () => {
    const { rerender } = render(<EvidenceSheet dto={dto({ sourceType: "GITHUB", weights: null,
      members: [{ name: "Ana Cruz", githubPct: 100, docsPct: null, combinedPct: 100, flags: [] }], memberCount: 1, equalSharePct: 100 })} />);
    expect(screen.queryByRole("columnheader", { name: "Documents" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "GitHub" })).toBeTruthy();

    rerender(<EvidenceSheet dto={dto({ sourceType: "EDITOR", weights: null, repoUrl: null,
      members: [{ name: "Ana Cruz", githubPct: null, docsPct: 100, combinedPct: 100, flags: [] }], memberCount: 1, equalSharePct: 100 })} />);
    expect(screen.queryByRole("columnheader", { name: "GitHub" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Documents" })).toBeTruthy();
    expect(screen.getByText("Not applicable")).toBeTruthy();

    rerender(<EvidenceSheet dto={dto()} />);
    expect(screen.getByRole("columnheader", { name: "GitHub" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Documents" })).toBeTruthy();
  });

  it("prints the note with the real weights and the evidence-not-a-grade wording", () => {
    render(<EvidenceSheet dto={dto({ weights: { githubPct: 40, docsPct: 60 } })} />);
    const note = tableNote({ memberCount: 3, equalSharePct: 33.3, sourceType: "COMBINED", weights: { githubPct: 40, docsPct: 60 } });
    expect(note).toContain("An equal share for 3 members is 33.3%.");
    expect(note).toContain("Combined = 40% GitHub + 60% Documents.");
    expect(note).toContain("FAIRTRAZE Collaborative Editor");
    expect(note).toContain("This report is evidence, not a grade.");
    expect(screen.getByText(note)).toBeTruthy();
  });

  it("has three EMPTY decision boxes, a Remarks line, the signature lines and the footer", () => {
    render(<EvidenceSheet dto={dto()} />);
    const boxes = screen.getAllByTestId("decision-box");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.textContent).toBe("");
      expect(box.querySelector("input")).toBeNull();
    }
    expect(screen.getByText("Same grade for all members")).toBeTruthy();
    expect(screen.getByText("Individual grades based on the contribution evidence")).toBeTruthy();
    expect(screen.getByText("Needs further review")).toBeTruthy();
    expect(screen.getByText("Remarks:")).toBeTruthy();
    expect(screen.getByText("Prepared by (group leader)")).toBeTruthy();
    expect(screen.getByText("Noted by (instructor)")).toBeTruthy();
    expect(screen.getByText("Date")).toBeTruthy();
    expect(screen.getByText("FAIRTRAZE AI")).toBeTruthy();
    expect(screen.getByText("The instructor can verify this report using the Report ID")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("never suggests a grade or shows Gini, bands or team health", () => {
    const { container } = render(<EvidenceSheet dto={dto()} />);
    const text = (container.textContent ?? "").toLowerCase();
    for (const word of ["gini", "healthy", "high risk", "moderate risk", "recommended", "suggested grade"]) {
      expect(text).not.toContain(word);
    }
  });
});
