import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { summaryFor, reviewStatusLine, aiAddressedLine, type AiReviewResponse, type AiSummaryView } from "../lib/aiReview";
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
    expect(screen.getByText(/Use Generate AI explanation & review/)).toBeTruthy();
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
});
