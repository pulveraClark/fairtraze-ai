import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { summaryFor, reviewStatusLine, aiAddressedLine, workSummaryState, type AiReviewResponse, type AiSummaryView } from "../lib/aiReview";
import { DocSectionProvider } from "../hooks/useDocSectionLink";
import { MemberWorkSummary } from "./report/AiWorkSummary";
import { StudentMemberWindow, type StudentMemberView } from "./StudentMemberWindow";
import { Narrative } from "./Narrative";
import { MemberContributionList } from "./report/MemberContributionList";
import { useGenerateAiReport } from "../hooks/useGenerateAiReport";
import type { UseAiReview } from "../hooks/useAiReview";
import type { AnyScoredMember } from "@shared/types";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1 } }), useAuthOptional: () => ({ token: "t", user: { id: 1 } }) }));

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
    expect(screen.getByText("AI findings")).toBeTruthy();
    expect(screen.getByText(/May be wrong · Based on the analysis of/)).toBeTruthy();
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

  it("a facts-only summary never shows the AI badge: grey 'Changed files only' pill and a neutral note above the text", () => {
    render(<MemberWorkSummary review={base} member={{ userId: 2 }} />);
    expect(screen.getByText("Changed files only")).toBeTruthy();
    expect(screen.queryByText("AI findings")).toBeNull();
    expect(screen.queryByText(/May be wrong/)).toBeNull();
    const note = screen.getByText(/The AI findings couldn't be written right now, so this shows the changed files\./);
    const text = screen.getByText("Wrote the Methodology section.");
    expect(note.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("offers Regenerate beside the fallback note to the instructor only, and it is the same action", async () => {
    const onGenerate = vi.fn();
    const { rerender } = render(<MemberWorkSummary review={base} member={{ userId: 2 }} onGenerate={onGenerate} />);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    // The server's flag decides who may generate.
    rerender(<MemberWorkSummary review={{ ...base, canGenerate: false }} member={{ userId: 2 }} onGenerate={onGenerate} />);
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
  });

  it("shows the writing pill with its helper text while summaries are being written", () => {
    render(<MemberWorkSummary review={{ ...base, summaries: null, running: true }} member={{ userId: 1 }} />);
    expect(screen.getByRole("status").textContent).toBe("AI findings · writing…");
    expect(screen.getByText("This takes about a minute. You can keep using the page.")).toBeTruthy();
  });

  it("tells the instructor when a newer analysis exists", () => {
    render(<MemberWorkSummary review={{ ...base, outdated: true }} member={{ userId: 1 }} />);
    expect(screen.getByText(/A newer analysis exists/)).toBeTruthy();
  });

  it("renders nothing when AI review is off; shows a status while running and a hint when empty", () => {
    const { container, rerender } = render(<MemberWorkSummary review={{ enabled: false }} member={{ userId: 1 }} />);
    expect(container.innerHTML).toBe("");
    rerender(<MemberWorkSummary review={{ ...base, summaries: null, running: true }} member={{ userId: 1 }} />);
    expect(screen.getByRole("status").textContent).toMatch(/writing/);
    rerender(<MemberWorkSummary review={{ ...base, summaries: null }} member={{ userId: 1 }} />);
    expect(screen.getByText("No AI findings yet.")).toBeTruthy();
  });

  it("instructor with no summary gets the Generate button, which runs the shared action; others get none", async () => {
    const onGenerate = vi.fn();
    const empty = { ...base, summaries: null };
    const { rerender } = render(<MemberWorkSummary review={empty} member={{ userId: 1 }} onGenerate={onGenerate} />);
    const btn = screen.getByRole("button", { name: "Generate AI findings" });
    expect(btn.className).toContain("bg-white");
    expect(screen.getByText("Same as the button in Member contributions. Covers the whole group (about 1 minute).")).toBeTruthy();
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

describe("source line", () => {
  const line = (t: string) => screen.getByText(new RegExp(`^${t} May be wrong · Based on the analysis of`));
  it("says what the AI read, by the group's source type", () => {
    const { rerender } = render(<MemberWorkSummary review={base} member={{ userId: 1 }} sourceType="GITHUB" />);
    expect(line("Written by AI after reading the commits\.")).toBeTruthy();
    rerender(<MemberWorkSummary review={base} member={{ userId: 1 }} sourceType="EDITOR" />);
    expect(line("Written by AI after reading the Docs\.")).toBeTruthy();
    rerender(<MemberWorkSummary review={base} member={{ userId: 1 }} sourceType="COMBINED" />);
    expect(line("Written by AI after reading the commits and Docs\.")).toBeTruthy();
    rerender(<MemberWorkSummary review={base} member={{ userId: 1 }} />);
    expect(line("Written by AI after reading the work\.")).toBeTruthy();
  });

  it("is passed through to the member window", () => {
    render(<StudentMemberWindow {...windowProps({ member: anaView, members: [anaView], ai: { ...base, canGenerate: false, summaries: [ana] }, sourceType: "EDITOR" })} />);
    expect(screen.getByText(/Written by AI after reading the Docs\. May be wrong/)).toBeTruthy();
  });

  it("is absent from the facts state", () => {
    render(<MemberWorkSummary review={base} member={{ userId: 2 }} sourceType="COMBINED" />);
    expect(screen.queryByText(/Written by AI/)).toBeNull();
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

const anaView: StudentMemberView = {
  userId: 1, name: "Ana Cruz", isLeader: false, functionalRoles: ["DEVELOPER"], avatarUpdatedAt: null,
  contributionShare: 0.6, githubContributionShare: null, documentContributionShare: null, flags: [], tasks: null,
};
const benView: StudentMemberView = { ...anaView, userId: 2, name: "Ben Reyes", isLeader: true, contributionShare: 0.4, tasks: { open: 1, done: 2 } };

function windowProps(over: Partial<React.ComponentProps<typeof StudentMemberWindow>> = {}): React.ComponentProps<typeof StudentMemberWindow> {
  return {
    member: anaView, members: [anaView], currentUserId: 1, memberCount: 2, sourceType: "GITHUB", noActivity: false,
    ai: { ...base, canGenerate: false }, onSelect: () => {}, onClose: () => {}, ...over,
  };
}

describe("StudentMemberWindow: the AI findings", () => {
  it("a member opens their own window: 'What you worked on', only their own entry, no arrows, no Generate", () => {
    render(<StudentMemberWindow {...windowProps()} />);
    expect(screen.getByText("What you worked on")).toBeTruthy();
    expect(screen.getByText("Added the login page.")).toBeTruthy();
    expect(screen.queryByText(/Wrote the Methodology section/)).toBeNull();
    expect(screen.queryByRole("button", { name: /generate|regenerate/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next member" })).toBeNull();
    expect(screen.getByText("AI findings")).toBeTruthy();
    expect(screen.getByText(/May be wrong · Based on the analysis of/)).toBeTruthy();
  });

  it("the leader opens another member: their findings (facts fallback is marked) and the arrows", () => {
    const onSelect = vi.fn();
    render(<StudentMemberWindow {...windowProps({ member: benView, members: [anaView, benView], onSelect })} />);
    expect(screen.getByText("What this member worked on")).toBeTruthy();
    expect(screen.getByText("Wrote the Methodology section.")).toBeTruthy();
    expect(screen.getByText("Changed files only")).toBeTruthy();
    expect(screen.getByText("Member 2 of 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next member" }) as HTMLButtonElement).disabled).toBe(true);
    screen.getByRole("button", { name: "Previous member" }).click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows only AI findings, shares, flags and tasks: no commit impact and no raw numbers", () => {
    render(<StudentMemberWindow {...windowProps({ member: { ...benView, flags: ["free-rider"] }, members: [anaView, benView] })} />);
    expect(screen.getByText("40.0%")).toBeTruthy();
    expect(screen.getByText("Low contribution")).toBeTruthy();
    expect(screen.getByText("2 of 3 done")).toBeTruthy();
    expect(screen.queryByText(/commit impact|lines added|additions|sessions|churn|active days/i)).toBeNull();
  });

  it("says so when AI findings are off or this member has none yet", () => {
    const off = render(<StudentMemberWindow {...windowProps({ ai: { enabled: false } })} />);
    expect(screen.getByText("AI findings are not turned on for this class.")).toBeTruthy();
    off.unmount();
    render(<StudentMemberWindow {...windowProps({ ai: { ...base, summaries: [] } })} />);
    expect(screen.getByText(/No AI findings for this member yet/)).toBeTruthy();
  });

  it("is a full-screen dialog on a phone, with a 40px close button", () => {
    render(<StudentMemberWindow {...windowProps()} />);
    expect(screen.getByRole("dialog").className).toContain("h-full");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("h-10");
  });
});

const member = { studentName: "Ana Cruz", contributionShare: 1, flags: [] } as unknown as AnyScoredMember;

// The report page: the shared generator feeds the button in Member contributions and the Narrative card.
function Harness({ review, narrative, onGenerated, allowed = true }: { review: UseAiReview; narrative: string | null; onGenerated: (t: string) => void; allowed?: boolean }) {
  const generator = useGenerateAiReport(1, review, onGenerated);
  return (
    <>
      <MemberContributionList members={[member]} onOpen={() => {}} generator={allowed ? generator : undefined} hasNarrative={!!narrative} />
      <Narrative narrative={narrative} projectId={1} onNarrativeGenerated={onGenerated} review={review} generator={generator} />
    </>
  );
}

describe("AI button in Member contributions", () => {
  it("one click starts both when AI findings are on", async () => {
    const start = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ narrative: "Text." }) }));
    const onGenerated = vi.fn();
    render(<Harness review={{ data: base, error: null, start }} narrative={null} onGenerated={onGenerated} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate AI findings" }));
    expect(start).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith("Text."));
  });

  it("keeps the same label and starts nothing when the class switch is off", async () => {
    const start = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ narrative: "Text." }) }));
    render(<Harness review={{ data: { enabled: false }, error: null, start }} narrative={null} onGenerated={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Generate AI findings" }));
    expect(start).not.toHaveBeenCalled();
  });

  it("is a 40px secondary button with the note under it, disabled while generating", async () => {
    let finish: (v: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise((r) => { finish = r; })));
    render(<Harness review={{ data: base, error: null, start: vi.fn() }} narrative={null} onGenerated={() => {}} />);
    const btn = screen.getByRole("button", { name: "Generate AI findings" });
    expect(btn.className).toContain("bg-white");
    expect(btn.className).toContain("min-h-10");
    expect(screen.getByText("Also updates the AI findings below.")).toBeTruthy();
    await userEvent.click(btn);
    expect((await screen.findByRole("button", { name: "Generating…" }) as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, json: async () => ({ narrative: "Text." }) });
    await waitFor(() => expect((screen.getByRole("button", { name: /generate/i }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("is not rendered for a viewer who may not generate (admin)", () => {
    render(<Harness review={{ data: base, error: null, start: vi.fn() }} narrative={null} onGenerated={() => {}} allowed={false} />);
    expect(screen.queryByRole("button", { name: /generate|regenerate/i })).toBeNull();
    expect(screen.queryByText("Also updates the AI findings below.")).toBeNull();
  });

  it("shows a calm status while writing, a failure line, and the neutral AI-addressed note", () => {
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, running: true }, error: null, start: vi.fn() }} />);
    expect(screen.getByText("Writing AI findings…")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={{ data: { ...base, status: "FAILED", aiAddressed: [{ userId: 2, name: "Ben Reyes", where: "docs", count: 1 }] }, error: null, start: vi.fn() }} />);
    expect(screen.getByText(/could not be written because the AI was unavailable/)).toBeTruthy();
    expect(screen.getByText(/Ben Reyes appears to address the AI/)).toBeTruthy();
  });

  it("has exactly one AI button in every state (none inside the AI card), and the label follows the state", () => {
    const review = { data: base, error: null, start: vi.fn() };
    const { rerender } = render(<Harness review={review} narrative={null} onGenerated={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^(Re)?generate AI findings$/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Generate AI findings" })).toBeTruthy();
    expect(screen.getByText(/No AI findings yet\. Use the Generate AI findings button in Member contributions above\./)).toBeTruthy();
    rerender(<Harness review={review} narrative="T." onGenerated={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^(Re)?generate AI findings$/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Regenerate AI findings" }).className).toContain("bg-white");
    expect(screen.queryByRole("button", { name: "Regenerate" })).toBeNull();
    expect(screen.queryByText(/No AI findings yet/)).toBeNull();
  });

  it("headings the card AI findings with an icon, no separate pill, and the one footer disclaimer", () => {
    render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} basedOnAt="2026-10-24T01:00:00Z" />);
    expect(screen.getByRole("heading", { name: "AI findings" })).toBeTruthy();
    expect(screen.getAllByText("AI findings")).toHaveLength(1);
    expect(screen.getByText(/May be wrong · Based on the analysis of .+\. Informational only; it does not assign grades or replace instructor judgment\./)).toBeTruthy();
    // The card adds no second "supports your assessment..." sentence of its own.
    expect(screen.queryByText(/supports your assessment|should not replace your own judgment/)).toBeNull();
  });

  it("status line: ready and writing; nothing extra before anything is generated", () => {
    const mk = (data: AiReviewResponse) => ({ data, error: null, start: vi.fn() });
    const { rerender } = render(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk(base)} />);
    expect(screen.getByText("Select a member above to read their AI findings.")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ ...base, summaries: null })} />);
    expect(screen.queryByText(/Select a member above|not generated yet|Writing AI findings/)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ ...base, summaries: null, running: true })} />);
    expect(screen.getByText("Writing AI findings…")).toBeTruthy();
    rerender(<Narrative narrative="T." projectId={1} onNarrativeGenerated={() => {}} review={mk({ enabled: false })} />);
    expect(screen.queryByText(/Select a member above|not generated yet|Writing AI findings/)).toBeNull();
  });
});
