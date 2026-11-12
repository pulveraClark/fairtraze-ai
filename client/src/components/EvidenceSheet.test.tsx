import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { EvidenceReportDto } from "@shared/evidenceReport";
import { EvidenceSheet } from "./EvidenceSheet";
import { sourcesText, tableNote } from "../lib/evidenceText";

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
    for (const label of ["Class:", "Project:", "Repository:", "Contribution status:", "Analyzed:", "Generated:", "Sources:", "Report ID:"]) {
      expect(screen.getByText(label).style.fontWeight).toBe("700");
    }
    // Two columns: Class/Project/Repository/Contribution status on the left, the other four on the right.
    const [left, right] = screen.getAllByRole("table").slice(0, 2);
    expect(within(left).getByText("Contribution status:")).toBeTruthy();
    expect(within(right).getByText("Report ID:")).toBeTruthy();
    expect(within(right).queryByText("Class:")).toBeNull();
    expect(screen.getByText("GitHub + Documents")).toBeTruthy();
    const id = screen.getByText("FT-7K2P-9X");
    expect(id.style.fontWeight).toBe("700");
  });

  it("Sources reads GitHub, Documents or GitHub + Documents for the three source types", () => {
    expect(sourcesText("GITHUB")).toBe("GitHub");
    expect(sourcesText("EDITOR")).toBe("Documents");
    expect(sourcesText("COMBINED")).toBe("GitHub + Documents");
    const { rerender } = render(<EvidenceSheet dto={dto({ sourceType: "GITHUB", weights: null })} />);
    expect(within(screen.getAllByRole("table")[1]).getByText("GitHub")).toBeTruthy();
    rerender(<EvidenceSheet dto={dto({ sourceType: "EDITOR", weights: null, repoUrl: null })} />);
    expect(within(screen.getAllByRole("table")[1]).getByText("Documents")).toBeTruthy();
  });

  it("shows real flag names or None, and Combined in bold", () => {
    render(<EvidenceSheet dto={dto()} />);
    const rows = within(screen.getAllByRole("table")[2]).getAllByRole("row"); // [0] is the header; tables 0 and 1 are the info columns
    expect(within(rows[1]).getByText("None")).toBeTruthy();
    expect(within(rows[2]).getByText("overload")).toBeTruthy();
    expect(within(rows[3]).getByText("free-rider, deadline-driven")).toBeTruthy();
    expect(within(rows[1]).getByText("35.0%").style.fontWeight).toBe("700");
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
    expect(note.startsWith("Shares are based only on recorded activity: commits, meaningful lines and active days in GitHub, and document work in the FAIRTRAZE Collaborative Editor.")).toBe(true);
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

  it("shows the repository as owner/repo, dates without a time, and one decimal everywhere", () => {
    render(<EvidenceSheet dto={dto()} />);
    expect(screen.getByText("acme/app")).toBeTruthy();
    expect(screen.queryByText("https://github.com/acme/app")).toBeNull();
    expect(screen.getByText("November 10, 2026")).toBeTruthy();
    expect(screen.getByText("November 12, 2026")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
    expect(screen.getByText(/equal share for 3 members is 33\.3%/)).toBeTruthy();
  });

  it("uses the formal table style: rules above and below the header, none vertical", () => {
    render(<EvidenceSheet dto={dto()} />);
    const header = screen.getByRole("columnheader", { name: "Member" });
    expect(header.style.borderTop).toContain("solid");
    expect(header.style.borderBottom).toContain("solid");
    expect(header.style.borderLeft).toBe("");
    expect(header.style.borderRight).toBe("");
    const rows = within(screen.getAllByRole("table")[2]).getAllByRole("row");
    const lastCell = within(rows[rows.length - 1]).getByText("Cai Tan");
    expect(lastCell.style.borderBottom).toContain("1.5px");
    expect(lastCell.style.borderLeft).toBe("");
  });

  it("states the contribution status from the flags only", () => {
    const { rerender } = render(<EvidenceSheet dto={dto()} />);
    expect(screen.getByText("Needs review (2 of 3 flagged)")).toBeTruthy();
    rerender(<EvidenceSheet dto={dto({ members: dto().members.map((m) => ({ ...m, flags: [] })) })} />);
    expect(screen.getByText("Fair")).toBeTruthy();
  });

  it("drops the Combined sentence and the other source's wording for a single-source assignment", () => {
    const gh = tableNote({ memberCount: 2, equalSharePct: 50, sourceType: "GITHUB", weights: null });
    expect(gh).not.toContain("Combined =");
    expect(gh).not.toContain("Collaborative Editor");
    expect(gh).toContain("An equal share for 2 members is 50.0%.");
    const ed = tableNote({ memberCount: 2, equalSharePct: 50, sourceType: "EDITOR", weights: null });
    expect(ed).not.toContain("Combined =");
    expect(ed).not.toContain("GitHub");
    expect(ed).toContain("document work in the FAIRTRAZE Collaborative Editor");
  });

  it("renders every member of a large group (no clipped rows) and omits 'of Y' when it may flow", () => {
    const members = Array.from({ length: 15 }, (_, i) => ({
      name: `Member ${String.fromCharCode(65 + i)}`, githubPct: 6.7, docsPct: 6.7, combinedPct: 6.7, flags: [] as never[],
    }));
    const { container } = render(<EvidenceSheet dto={dto({ members, memberCount: 15, equalSharePct: 6.7 })} />);
    for (const m of members) expect(screen.getByText(m.name)).toBeTruthy();
    expect(container.querySelector("article")?.style.overflow).toBe("");
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();

    const big = Array.from({ length: 30 }, (_, i) => ({ ...members[0], name: `Person ${i}` }));
    render(<EvidenceSheet dto={dto({ members: big, memberCount: 30, equalSharePct: 3.3 })} />);
    expect(screen.getByText("Page 1")).toBeTruthy();
  });

  it("student sheet never shows Gini, bands, team health, thresholds or the instructor tag", () => {
    const { container } = render(<EvidenceSheet dto={dto()} />);
    const text = container.textContent ?? "";
    for (const word of [
      "Gini", "Healthy", "Moderate", "High risk", "High Risk", "Imbalanced", "Team health", "threshold",
      "INSTRUCTOR COPY", "@", "commits:", "lines:",
    ]) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain("Contribution status:");
  });
});
