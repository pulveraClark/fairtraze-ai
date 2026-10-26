import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocSectionProvider } from "../hooks/useDocSectionLink";
import { BriefCheckCard, NOTHING_FOUND_LINE, NO_BRIEF_LINE, COULDNT_CHECK_REASON, truncateQuote } from "./BriefCheckCard";
import { StudentWorkSummaries } from "./StudentWorkSummaries";
import { Narrative } from "./Narrative";
import { briefStatusLine, type AiBriefCheck, type AiReviewResponse } from "../lib/aiReview";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));
afterEach(() => { vi.unstubAllGlobals(); });

const LONG = "The survey asks members how the work was shared and what each person did during the project. ".repeat(3).trim();
const gh = "https://github.com/example/Trips/commit/a41f9c2d0e5b#diff-abc";

const check: AiBriefCheck = {
  generatedAt: "2026-10-26T01:00:00Z",
  outdated: false,
  nothingFound: false,
  aiAddressedCount: 2,
  requirements: [
    { text: "Has a login page", status: "FOUND", unverified: false, evidence: [
      { type: "file", ref: "src/Login.tsx", quote: "export function Login()", quoteHidden: false, href: gh, isCommit: true, more: [{ sha: "b52e0d3", href: "https://github.com/example/Trips/commit/b52e0d3" }] },
      { type: "file", ref: "src/Login.tsx", quote: "second quote", quoteHidden: false, href: gh, isCommit: true },
      { type: "doc", ref: "Methodology", quote: "", quoteHidden: true },
    ] },
    { text: "Has a survey", status: "FOUND", unverified: false, evidence: [{ type: "doc", ref: "Survey", quote: LONG, quoteHidden: false }] },
    { text: "Has charts", status: "PARTLY_FOUND", unverified: false, evidence: [] },
    { text: "Has a README", status: "NOT_FOUND", unverified: false, evidence: [] },
    { text: "Has tests", status: "NOT_FOUND", unverified: true, evidence: [] },
  ],
};

const pill = (label: string) => screen.getByText((_c, el) => el?.tagName === "SPAN" && el.textContent?.endsWith(label) === true && el.className.includes("rounded-full"));
const open = () => userEvent.click(screen.getByText(/Brief check/));

describe("BriefCheckCard", () => {
  it("is collapsed, labelled as AI that may be wrong, with the counts line first and zero counts left out", async () => {
    render(<BriefCheckCard check={check} instructor />);
    const details = screen.getByText(/Brief check · AI review, may be wrong/).closest("details")!;
    expect(details.open).toBe(false);
    await open();
    expect(details.open).toBe(true);
    expect(screen.getByText("2 found · 1 partly found · 1 not found · 1 couldn't check")).toBeTruthy();
    expect(screen.getByText(/Not a grade and not a judgment of quality/)).toBeTruthy();
    expect(screen.getByText("AI explanation")).toBeTruthy();
    expect(screen.getByText(/May be wrong · Based on the analysis of/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("omits a zero count and the couldn't-check part", async () => {
    const some = { ...check, requirements: [check.requirements[0]!, check.requirements[2]!, check.requirements[3]!] };
    render(<BriefCheckCard check={some} />);
    await open();
    expect(screen.getByText("1 found · 1 partly found · 1 not found")).toBeTruthy();
  });

  it("shows attention items first in order, with found hidden until the button is used", async () => {
    render(<BriefCheckCard check={check} />);
    await open();
    const text = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    const order = ["Has charts", "Has a README", "Has tests"].map((t) => text.findIndex((x) => x.includes(t)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(pill("Partly found")).toBeTruthy();
    expect(pill("Not found in the work")).toBeTruthy();
    expect(pill("Couldn't check")).toBeTruthy();
    expect(screen.queryByText("Has a login page")).toBeNull();

    const toggle = screen.getByRole("button", { name: "Show found requirements (2)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide found requirements (2)" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Has a login page")).toBeTruthy();
    expect(screen.getByText("Has a survey")).toBeTruthy();
    expect(screen.getAllByText((_c, el) => el?.tagName === "SPAN" && el.textContent === "✓Found").length).toBe(2);
  });

  it("explains a couldn't-check item in plain words", async () => {
    render(<BriefCheckCard check={check} />);
    await open();
    expect(screen.getByText(COULDNT_CHECK_REASON)).toBeTruthy();
    expect(screen.queryByText(/No evidence could be checked/)).toBeNull();
  });

  it("keeps evidence closed by default; code evidence is a file link only; docs show one short quote", async () => {
    const open_ = vi.fn();
    render(<DocSectionProvider value={open_}><BriefCheckCard check={check} /></DocSectionProvider>);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Show found requirements (2)" }));
    const evidence = screen.getAllByText("See evidence").map((s) => s.closest("details")!);
    expect(evidence.length).toBe(2);
    expect(evidence.every((d) => !d.open)).toBe(true);
    for (const s of screen.getAllByText("See evidence")) await userEvent.click(s);

    // Code: the file once, no quote, no commit codes.
    const files = screen.getAllByRole("link", { name: "Open Login.tsx changes on GitHub (new tab)" });
    expect(files.length).toBe(1);
    expect(files[0]!.getAttribute("href")).toBe(gh);
    expect(files[0]!.getAttribute("target")).toBe("_blank");
    expect(files[0]!.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByText("export function Login()")).toBeNull();
    expect(screen.queryByText("second quote")).toBeNull();
    expect(screen.queryByText(/\+1 more/)).toBeNull();
    expect(screen.queryByText(/b52e0d3|a41f9c2/)).toBeNull();

    // Docs: section link, hidden-quote note, and a quote cut at about 140 characters.
    expect(screen.getByText(/Text written by another member is not shown/)).toBeTruthy();
    const quote = screen.getByText((_c, el) => el?.tagName === "BLOCKQUOTE")!;
    expect(quote.textContent!.length).toBeLessThanOrEqual(141);
    expect(quote.textContent!.endsWith("…")).toBe(true);
    await userEvent.click(screen.getByRole("link", { name: "Open section Survey in Docs" }));
    expect(open_).toHaveBeenCalledWith("Survey");
  });

  it("truncates only long quotes", () => {
    expect(truncateQuote("short")).toBe("short");
    expect(truncateQuote(LONG).length).toBeLessThanOrEqual(141);
  });

  it("all found: one calm line and no list", async () => {
    const all = { ...check, requirements: [check.requirements[0]!, check.requirements[1]!] };
    render(<BriefCheckCard check={all} />);
    await open();
    expect(screen.getByText("All 2 requirements found")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /found requirements/ })).toBeNull();
  });

  it("no brief: a plain line, no collapsible and no empty body", () => {
    const { container } = render(<BriefCheckCard check={{ ...check, requirements: [] }} />);
    expect(screen.getByText(NO_BRIEF_LINE)).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });

  it("nothing found: one calm line; the instructor sees the AI-addressed note, the leader does not", async () => {
    const none = { ...check, nothingFound: true, requirements: [check.requirements[3]!] };
    const { rerender } = render(<BriefCheckCard check={none} instructor />);
    await open();
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
