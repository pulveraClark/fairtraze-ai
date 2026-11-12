import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PrintableReport } from "./PrintableReport";
import { PrintableReportBundle } from "./PrintableReportBundle";

const member = (name: string, flags: string[] = [], share = 0.5) => ({
  studentName: name, flags, contributionShare: share,
  githubContributionShare: share, documentContributionShare: share,
});

const stored = (over: Record<string, unknown> = {}, members: unknown[] = [member("Ana", ["overload"]), member("Ben")]) => ({
  projectId: 1,
  groupName: "Group 1",
  repoUrl: "https://github.com/acme/app",
  analyzedAt: "2026-10-27T03:00:00Z",
  sourceType: "COMBINED",
  evidenceReportId: null,
  scoringConfig: { blend: { wGitHub: 0.5, wDocs: 0.5 } },
  report: { members, memberCount: members.length, gini: 0.1224, teamHealth: "Healthy" },
  ...over,
}) as never;

const META = { classCode: "CC-APPSDEV22", classSubjectName: "Applications Development", assignmentTitle: "Capstone" };

describe("instructor export (same sheet as the student report)", () => {
  it("has the INSTRUCTOR COPY tag on its own line above the university name", () => {
    render(<PrintableReport stored={stored()} meta={META} />);
    const tag = screen.getByTestId("instructor-tag");
    expect(tag.textContent).toBe("INSTRUCTOR COPY");
    const university = screen.getByText(/University of Cebu/);
    expect(tag.parentElement?.contains(university)).toBe(false);
    expect(tag.parentElement?.style.justifyContent).toBe("flex-end");
  });

  it("shows the Gini index with 3 decimals and the band word, and the flags-only status", () => {
    render(<PrintableReport stored={stored()} meta={META} />);
    expect(screen.getByText("Gini index")).toBeTruthy();
    expect(screen.getByText("0.122 (Healthy)")).toBeTruthy();
    expect(screen.getByText("Needs review (1 of 2 flagged)")).toBeTruthy();
  });

  it.each([["Moderate Risk", "0.300 (Moderate)", 0.3], ["High Risk", "0.450 (High)", 0.45]])(
    "band word for %s",
    (health, text, gini) => {
      render(<PrintableReport stored={stored({ report: { members: [member("Ana")], memberCount: 1, gini, teamHealth: health } })} meta={META} />);
      expect(screen.getByText(text)).toBeTruthy();
    },
  );

  it("takes class and project from the summary entry and leaves out the college and the leader name", () => {
    render(<PrintableReport stored={stored()} meta={META} />);
    expect(screen.getByText("CC-APPSDEV22 · Applications Development")).toBeTruthy();
    expect(screen.getByText("Capstone")).toBeTruthy();
    expect(screen.queryByText("College of Computer Studies")).toBeNull();
    expect(screen.getByText("Prepared by (group leader)").nextElementSibling).toBeNull();
  });

  it("shows the Report ID and the footer ID when one exists", () => {
    render(<PrintableReport stored={stored({ evidenceReportId: "FT-7K2P-9X" })} meta={META} />);
    expect(screen.getAllByText(/FT-7K2P-9X/).length).toBe(2);
    expect(screen.getByTestId("instructor-footer").textContent).toBe("FAIRTRAZE AI · Instructor copy · Report ID FT-7K2P-9X");
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("says 'Not issued' and leaves the ID out of the footer when none exists (none is made)", () => {
    render(<PrintableReport stored={stored()} meta={META} />);
    expect(screen.getByText("Not issued")).toBeTruthy();
    expect(screen.getByTestId("instructor-footer").textContent).toBe("FAIRTRAZE AI · Instructor copy");
    expect(document.body.textContent).not.toMatch(/FT-[A-Z0-9]{4}-[A-Z0-9]{2}/);
  });

  it("has none of the old design: banner, handles, bars, Gini pill, long legend, Team health wording", () => {
    const withHandle = { ...member("Ana"), githubUsername: "ana-gh" };
    const { container } = render(<PrintableReport stored={stored({}, [withHandle])} meta={META} />);
    const text = container.textContent ?? "";
    for (const word of ["@ana-gh", "Team health", "Team Health", "Contribution Fairness Report", "Contribution Profiling", "Free-rider / Inactive", "export-legend"]) {
      expect(text).not.toContain(word);
    }
    expect(container.querySelector("[data-testid='export-legend']")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(text).toContain("This report is evidence, not a grade.");
  });

  it("has the Instructor Decision box with three empty check boxes and two Remarks lines", () => {
    render(<PrintableReport stored={stored()} meta={META} />);
    const boxes = screen.getAllByTestId("decision-box");
    expect(boxes).toHaveLength(3);
    for (const b of boxes) expect(b.textContent).toBe("");
    expect(screen.getByText("Remarks:")).toBeTruthy();
  });

  it("renders all 15 members of a large group", () => {
    const members = Array.from({ length: 15 }, (_, i) => member(`Member ${String.fromCharCode(65 + i)}`, [], 1 / 15));
    render(<PrintableReport stored={stored({}, members)} meta={META} />);
    const rows = within(screen.getAllByRole("table")[2]).getAllByRole("row");
    expect(rows).toHaveLength(16);
    for (let i = 0; i < 15; i++) expect(screen.getByText(`Member ${String.fromCharCode(65 + i)}`)).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("carries Letter, margin 0 (no browser header or footer) and sets a short print title", () => {
    const { container } = render(<PrintableReport stored={stored()} meta={META} />);
    const css = container.querySelector("style")?.textContent ?? "";
    expect(css).toContain("size: Letter portrait");
    expect(css).toContain("margin: 0;");
    expect(css).not.toContain("overflow: hidden");
    const before = document.title;
    window.dispatchEvent(new Event("beforeprint"));
    expect(document.title).toBe("Contribution Evidence Report - Group 1 (Instructor copy)");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe(before);
  });
});

describe("bulk export", () => {
  const items = [
    { projectId: 1, stored: stored({ groupName: "Group 1", evidenceReportId: "FT-AAAA-AA" }), meta: META },
    { projectId: 2, stored: stored({ groupName: "Group 2" }), meta: META },
    { projectId: 3, stored: stored({ groupName: "Group 3", evidenceReportId: "FT-BBBB-BB" }), meta: META },
  ];

  it("prints one sheet per group, each with its own Report ID or 'Not issued', and a page break between them", () => {
    const { container } = render(<PrintableReportBundle items={items} />);
    expect(container.querySelectorAll("article")).toHaveLength(3);
    expect(container.querySelectorAll(".ft-evidence-bulk-break")).toHaveLength(2);
    expect(screen.getAllByTestId("instructor-tag")).toHaveLength(3);
    const footers = screen.getAllByTestId("instructor-footer").map((f) => f.textContent);
    expect(footers).toEqual([
      "FAIRTRAZE AI · Instructor copy · Report ID FT-AAAA-AA",
      "FAIRTRAZE AI · Instructor copy",
      "FAIRTRAZE AI · Instructor copy · Report ID FT-BBBB-BB",
    ]);
    expect(screen.getByText("Not issued")).toBeTruthy();
  });

  it("numbers pages 1 of 3, 2 of 3, 3 of 3 while every sheet is one page", () => {
    render(<PrintableReportBundle items={items} />);
    for (const label of ["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"]) expect(screen.getByText(label)).toBeTruthy();
  });

  it("omits page numbers when one group is large enough to flow onto a second page", () => {
    const big = Array.from({ length: 20 }, (_, i) => member(`Person ${i}`, [], 0.05));
    render(<PrintableReportBundle items={[items[0], { projectId: 9, stored: stored({}, big), meta: META }]} />);
    expect(screen.queryByText(/^Page \d/)).toBeNull();
    expect(screen.getByText("Person 19")).toBeTruthy();
  });
});
