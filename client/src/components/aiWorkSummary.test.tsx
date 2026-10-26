import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { summaryFor, reviewStatusLine, aiAddressedLine, workSummaryState, type AiReviewResponse, type AiSummaryView } from "../lib/aiReview";
import { DocSectionProvider } from "../hooks/useDocSectionLink";
import { MemberWorkSummary } from "./report/AiWorkSummary";
import { StudentWorkSummaries } from "./StudentWorkSummaries";
import { Narrative } from "./Narrative";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }) }));

const evidence = { files: [{ path: "src/pages/Login.tsx", added: 40, removed: 2 }], docSections: ["Methodology"], commitCount: 3, otherCommits: 2 };
const ana: AiSummaryView = { userId: 1, name: "Ana Cruz", githubUsername: "anacruz", isYou: true, summary: "Added the login page.", source: "ai", evidence };
const ben: AiSummaryView = { userId: 2, name: "Ben Reyes", githubUsername: "benreyes", isYou: false, summary: "Wrote the Methodology section.", source: "facts", evidence: { ...evidence, files: [] } };
const base: AiReviewResponse = { enabled: true, running: false, canGenerate: true, hasReport: true, generatedAt: "2026-10-26T01:00:00Z", basedOnReportAt: "2026-10-24T01:00:00Z", outdated: false, summaries: [ana, ben] };

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("lib/aiReview", () => {
  it("matches a report member by user id, else by GitHub username (case-insensitive)", () => {
    expect(summaryFor(base, { userId: 2 })?.name).toBe("Ben Reyes");
    expect(summaryFor(base, { githubUsername: "ANACRUZ" })?.name).toBe("Ana Cruz");
    expect(summaryFor(base, { githubUsername: "nobody" })).toBeNull();
    expect(summaryFor({ enabled: false }, { userId: 1 })).toBeNull();
  });

  it("status lines: nothing while running or fine, a calm line for failure, partial and outdated", () => {
    expect(reviewStatusLine(base)).toBeNull();
    expect(reviewStatusLine({ ...base, running: true, status: "FAILED" })).toBeNull();
    expect(reviewStatusLine({ ...base, status: "FAILED" })).toMatch(/unavailable/);
    expect(reviewStatusLine({ ...base, status: "PARTIAL" })).toMatch(/changed files only/);
    expect(reviewStatusLine({ ...base, outdated: true })).toMatch(/earlier analysis/);
  });

  it("AI-addressed note is neutral and names each member once", () => {
    const line = aiAddressedLine({ ...base, aiAddressed: [{ userId: 2, name: "Ben Reyes", where: "docs", count: 1 }, { userId: 2, name: "Ben Reyes", where: "commits", count: 2 }] });
    expect(line).toBe("Some text from Ben Reyes appears to address the AI. It was not used.");
    expect(aiAddressedLine(base)).toBeNull();
  });
});

describe("MemberWorkSummary (instructor drawer)", () => {
  it("shows the summary, labels it as AI and may-be-wrong, and keeps evidence collapsed until opened", async () => {
    render(<MemberWorkSummary review={base} member={{ userId: 1 }} />);
    expect(screen.getByRole("heading", { name: /What this member worked on/ })).toBeTruthy();
    expect(screen.getByText("Added the login page.")).toBeTruthy();
    expect(screen.getByText(/AI summary, may be wrong\. Based on the analysis of/)).toBeTruthy();
    const details = screen.getByText("See evidence").closest("details")!;
    expect(details.open).toBe(false);
    await userEvent.click(screen.getByText("See evidence"));
    expect(details.open).toBe(true);
    expect(screen.getByText("src/pages/Login.tsx")).toBeTruthy();
    expect(screen.getByText("Methodology")).toBeTruthy();
    expect(screen.getByText(/2 older commits not read/)).toBeTruthy();
  });

  it("links changed files to the commit diff and Docs sections to the Docs tab; old reviews stay plain text", async () => {
    const href = "https://github.com/example/Trips/commit/a41f9c2d0e5b#diff-abc";
    const linked: AiReviewResponse = {
      ...base,
      summaries: [{ ...ana, evidence: { ...evidence, files: [{ path: "src/pages/Login.tsx", added: 40, removed: 2, href, isCommit: true, more: [{ sha: "b52e0d3", href: "https://github.com/example/Trips/commit/b52e0d3" }] }] } }],
    };
    const open = vi.fn();
    render(<DocSectionProvider value={open}><MemberWorkSummary review={linked} member={{ userId: 1 }} /></DocSectionProvider>);
    await userEvent.click(screen.getByText("See evidence"));
    const file = screen.getByRole("link", { name: "Open Login.tsx changes on GitHub (new tab)" });
    expect(file.getAttribute("href")).toBe(href);
    expect(file.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: "Open commit b52e0d3 on GitHub (new tab)" })).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Open section Methodology in Docs" }));
    expect(open).toHaveBeenCalledWith("Methodology");
  });

  it("a facts-only summary says the AI was unavailable", () => {
    render(<MemberWorkSummary review={base} member={{ userId: 2 }} />);
    expect(screen.getByText(/AI summary unavailable\. This line only lists changed files\./)).toBeTruthy();
  });

  it("tells the instructor when a newer analysis exists", () => {
    render(<MemberWorkSummary review={{ ...base, outdated: true }} member={{ userId: 1 }} />);
    expect(screen.getByText(/A newer analysis exists/)).toBeTruthy();
  });

  it("renders nothing when AI review is off; shows a status while running and a hint when empty", () => {
    const { container, rerender } = render(<MemberWorkSummary review={{ enabled: false }} member={{ userId: 1 }} />);
    expect(container.innerHTML).toBe("");
    rerender(<MemberWorkSummary review={{ ...base, summaries: null, running: true }} member={{ userId: 1 }} />);
    expect(screen.getByRole("status").textContent).toMatch(/Writing work summaries/);
    rerender(<MemberWorkSummary review={{ ...base, summaries: null }} member={{ userId: 1 }} />);
    expect(screen.getByText("No work summary yet.")).toBeTruthy();
  });

  it("instructor with no summary gets the Generate button, which runs the shared action; others get none", async () => {
    const onGenerate = vi.fn();
    const empty = { ...base, summaries: null };
    const { rerender } = render(<MemberWorkSummary review={empty} member={{ userId: 1 }} onGenerate={onGenerate} />);
    const btn = screen.getByRole("button", { name: "Generate AI explanation & review" });
    expect(btn.className).toContain("bg-white");
    expect(screen.getByText("Same as the button in the AI report. Covers the whole group (about 1 minute).")).toBeTruthy();
    await userEvent.click(btn);
    expect(onGenerate).toHaveBeenCalledTimes(1);
    rerender(<MemberWorkSummary review={empty} member={{ userId: 1 }} onGenerate={onGenerate} generating />);
    expect((screen.getByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);
    // The server's permission flag decides: no canGenerate means no button, even if a handler is passed.
    rerender(<MemberWorkSummary review={{ ...empty, canGenerate: false }} member={{ userId: 1 }} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
    // A summary already exists: no button.
    rerender(<MemberWorkSummary review={base} member={{ userId: 1 }} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: /Generate/ })).toBeNull();
  });
});

describe("work summary state", () => {
  it("is null when off, running, ready, or none", () => {
    expect(workSummaryState({ enabled: false })).toBeNull();
    expect(workSummaryState(null)).toBeNull();
    expect(workSummaryState({ ...base, running: true })).toBe("running");
    expect(workSummaryState(base)).toBe("ready");
    expect(workSummaryState({ ...base, summaries: null })).toBe("none");
    expect(workSummaryState({ ...base, summaries: [] })).toBe("none");
  });
});

function stubReview(body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));
}

describe("StudentWorkSummaries", () => {
  it("a member sees 'Summary of your work' with only their own entry", async () => {
    stubReview({ ...base, canGenerate: false, summaries: [ana] });
    render(<StudentWorkSummaries projectId={5} isLeader={false} />);
    await waitFor(() => expect(screen.getByText("Summary of your work")).toBeTruthy());
    expect(screen.getByText("Added the login page.")).toBeTruthy();
    expect(screen.queryByText(/Ben Reyes/)).toBeNull();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
  });

  it("the leader sees every member by name", async () => {
    stubReview({ ...base, canGenerate: false });
    render(<StudentWorkSummaries projectId={5} isLeader />);
    await waitFor(() => expect(screen.getByText("What each member worked on")).toBeTruthy());
    expect(screen.getByText("Ana Cruz (you)")).toBeTruthy();
    expect(screen.getByText("Ben Reyes")).toBeTruthy();
  });

  it("renders nothing when AI review is off or the request fails", async () => {
    stubReview({ enabled: false });
    const { container, unmount } = render(<StudentWorkSummaries projectId={5} isLeader={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
    unmount();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const again = render(<StudentWorkSummaries projectId={5} isLeader={false} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(again.container.innerHTML).toBe("");
  });
});

describe("Narrative with AI review", () => {
  it("the button is renamed when work summaries are on, and one click starts both", async () => {
    const start = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ narrative: "Text." }) }));
    const onGenerated = vi.fn();
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={onGenerated} review={{ data: base, error: null, start }} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate AI explanation & review" }));
    expect(start).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("Text."));
  });

  it("keeps the plain label and starts nothing when AI review is off", async () => {
    const start = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ narrative: "Text." }) }));
    render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={{ data: { enabled: false }, error: null, start }} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate explanation" }));
    expect(start).not.toHaveBeenCalled();
  });

  it("shows a calm status while writing, a failure line, and the neutral AI-addressed note", () => {
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, running: true }, error: null, start: vi.fn() }} />);
    expect(screen.getByText("Writing work summaries. You can keep using the page.")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, status: "FAILED", aiAddressed: [{ userId: 2, name: "Ben Reyes", where: "docs", count: 1 }] }, error: null, start: vi.fn() }} />);
    expect(screen.getByText(/could not be written because the AI was unavailable/)).toBeTruthy();
    expect(screen.getByText(/Ben Reyes appears to address the AI/)).toBeTruthy();
  });

  it("has exactly one AI button in every state, and the label follows the state", () => {
    const review = { data: base, error: null, start: vi.fn() };
    const { rerender } = render(<Narrative narrative={null} projectId={1} onNarrativeGenerated={() => {}} review={review} />);
    expect(screen.getAllByRole("button", { name: /explanation/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Generate AI explanation & review" })).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={review} />);
    expect(screen.getAllByRole("button", { name: /explanation/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Regenerate AI explanation & review" }).className).toContain("bg-white");
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
  });

  it("status line: ready, not generated yet, and writing", () => {
    const mk = (data: AiReviewResponse) => ({ data, error: null, start: vi.fn() });
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk(base)} />);
    expect(screen.getByText("✓ Work summaries ready · open a member below to read theirs")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ ...base, summaries: null })} />);
    expect(screen.getByText("Work summaries not generated yet")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ ...base, summaries: null, running: true })} />);
    expect(screen.getByText("Writing work summaries. You can keep using the page.")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ enabled: false })} />);
    expect(screen.queryByText(/Work summaries/)).toBeNull();
  });
});
