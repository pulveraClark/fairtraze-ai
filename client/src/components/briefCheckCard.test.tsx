import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocSectionProvider } from "../hooks/useDocSectionLink";
import { BriefCheckCard, NOTHING_FOUND_LINE } from "./BriefCheckCard";
import { StudentWorkSummaries } from "./StudentWorkSummaries";
import { Narrative } from "./Narrative";
import { briefStatusLine, type AiBriefCheck, type AiReviewResponse } from "../lib/aiReview";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));
afterEach(() => { vi.unstubAllGlobals(); });

const check: AiBriefCheck = {
  generatedAt: "2026-10-26T01:00:00Z",
  outdated: false,
  nothingFound: false,
  aiAddressedCount: 2,
  requirements: [
    { text: "Has a login page", status: "FOUND", unverified: false, evidence: [
      { type: "file", ref: "src/Login.tsx", quote: "export function Login()", quoteHidden: false },
      { type: "doc", ref: "Methodology", quote: "", quoteHidden: true },
    ] },
    { text: "Has a survey", status: "PARTLY_FOUND", unverified: false, evidence: [] },
    { text: "Has tests", status: "NOT_FOUND", unverified: true, evidence: [] },
  ],
};

const pill = (label: string) => screen.getByText((_c, el) => el?.tagName === "SPAN" && el.textContent?.endsWith(label) === true && el.className.includes("rounded-full"));

describe("BriefCheckCard", () => {
  it("is collapsed, labelled as AI that may be wrong, and shows status as text with evidence", async () => {
    render(<BriefCheckCard check={check} instructor />);
    const details = screen.getByText(/Brief check · AI review, may be wrong/).closest("details")!;
    expect(details.open).toBe(false);
    await userEvent.click(screen.getByText(/Brief check/));
    expect(details.open).toBe(true);
    for (const label of ["Found", "Partly found", "Not found"]) expect(pill(label)).toBeTruthy();
    expect(screen.getByText("export function Login()")).toBeTruthy();
    expect(screen.getByText("src/Login.tsx")).toBeTruthy();
    expect(screen.getByText("Docs section:")).toBeTruthy();
    expect(screen.getByText(/Text written by another member is not shown/)).toBeTruthy();
    expect(screen.getByText(/No evidence could be checked/)).toBeTruthy();
    expect(screen.getByText(/Not a grade and not a judgment of quality/)).toBeTruthy();
    expect(screen.getByText("AI explanation")).toBeTruthy();
    expect(screen.getByText(/May be wrong · Based on the analysis of/)).toBeTruthy();
  });

  it("links file evidence to GitHub in a new tab and Docs sections to the Docs tab, the same for instructor and leader", async () => {
    const href = "https://github.com/example/Trips/commit/a41f9c2d0e5b#diff-abc";
    const linked = { ...check, requirements: [{ ...check.requirements[0]!, evidence: [
      { type: "file" as const, ref: "src/Login.tsx", quote: "q", quoteHidden: false, href, isCommit: true, more: [{ sha: "b52e0d3", href: "https://github.com/example/Trips/commit/b52e0d3" }] },
      { type: "doc" as const, ref: "Methodology", quote: "", quoteHidden: true },
    ] }] };
    const open = vi.fn();
    for (const instructor of [true, false]) {
      const { unmount } = render(<DocSectionProvider value={open}><BriefCheckCard check={linked} instructor={instructor} /></DocSectionProvider>);
      await userEvent.click(screen.getByText(/Brief check/));
      const file = screen.getByRole("link", { name: "Open Login.tsx changes on GitHub (new tab)" });
      expect(file.getAttribute("href")).toBe(href);
      expect(file.getAttribute("target")).toBe("_blank");
      expect(file.getAttribute("rel")).toBe("noopener noreferrer");
      expect(screen.getByText("+1 more")).toBeTruthy();
      const doc = screen.getByRole("link", { name: "Open section Methodology in Docs" });
      expect(doc.getAttribute("target")).toBeNull();
      await userEvent.click(doc);
      unmount();
    }
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("Methodology");
  });

  it("nothing found: one calm line; the instructor sees the AI-addressed note, the leader does not", () => {
    const none = { ...check, nothingFound: true, requirements: [check.requirements[2]!] };
    const { rerender } = render(<BriefCheckCard check={none} instructor />);
    expect(screen.getByRole("status").textContent).toBe(NOTHING_FOUND_LINE);
    expect(screen.getByText(/appears to address the AI/)).toBeTruthy();
    rerender(<BriefCheckCard check={none} />);
    expect(screen.queryByText(/appears to address the AI/)).toBeNull();
  });

  it("tells the reader when the brief or analysis changed since", () => {
    render(<BriefCheckCard check={{ ...check, outdated: true }} />);
    expect(screen.getByText(/has changed since\. Generate again/)).toBeTruthy();
  });
});

const base: AiReviewResponse = { enabled: true, running: false, canGenerate: true, hasReport: true, summaries: [] };

describe("brief check placement", () => {
  it("leader view shows the brief check even before any summary exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...base, canGenerate: false, briefCheck: check }) }));
    render(<StudentWorkSummaries projectId={5} isLeader />);
    await waitFor(() => expect(screen.getByText(/Brief check · AI review/)).toBeTruthy());
    expect(screen.queryByText("What each member worked on")).toBeNull();
  });

  it("a member response without a brief check renders nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...base, canGenerate: false }) }));
    const { container } = render(<StudentWorkSummaries projectId={5} isLeader={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("instructor: the brief check sits in the AI report card; a failed run gets one calm line", () => {
    const start = vi.fn();
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, briefCheck: check }, error: null, start }} />);
    expect(screen.getByText(/Brief check · AI review/)).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, briefFailed: true }, error: null, start }} />);
    expect(screen.queryByText(/Brief check · AI review/)).toBeNull();
    expect(screen.getByText("The brief check could not run. Try again later.")).toBeTruthy();
    expect(briefStatusLine({ ...base, briefFailed: true, running: true })).toBeNull();
  });
});
