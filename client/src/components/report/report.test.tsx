import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CombinedScoredMember, DocumentScoredMember, ScoredMember, ScoringThresholds } from "@shared/types";
import { MemberDrawer } from "./MemberDrawer";
import { MemberContributionList } from "./MemberContributionList";

const thresholds: ScoringThresholds = { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 };

const gh: ScoredMember = {
  studentName: "Member A", githubUsername: "a", commits: 12, additions: 400, deletions: 50, churn: 450, activeDays: 5,
  lastPhaseRatio: 0.7, commitShare: 0.3, linesShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.4,
  codeLinesAdded: 380, commentLinesAdded: 20, blankLinesAdded: 0, codeToCommentRatio: 19,
  weightedAdditions: 350, selfChurnRatio: 0.1,
  commitImpactBreakdown: { structural: 0, functional: 12, cosmetic: 0, trivial: 0 },
  fileTypeBreakdown: { source: 380, test: 0, docs: 0, style: 0, config: 0, other: 0 },
  flags: ["deadline-driven"],
};

const doc: DocumentScoredMember = {
  studentName: "Member B", userId: 2, githubUsername: "", sessionCount: 4, totalInsertedChars: 5000, totalDeletedChars: 500,
  retainedChars: 4000, effectiveRetainedChars: 3900, churn: 5500, activeDays: 3, lastPhaseRatio: 0.2,
  sessionShare: 0.2, retainedTextShare: 0.2, activeDaysShare: 0.2, contributionShare: 0.2, selfChurnRatio: 0.05,
  weightedRetainedChars: 3800, editTypeBreakdown: { substantive: 3, revision: 1, formatting: 0, trivial: 0 },
  flags: [], importedRetainedChars: 0, importNote: null, insertedImageCount: 0,
};

const baseProps = { onClose: () => {}, source: "github" as const, thresholds, deadlineBasis: "activity-span" as const, memberCount: 3 };

describe("MemberDrawer", () => {
  beforeEach(() => { try { window.localStorage.clear(); } catch { /* ignore */ } });

  const ghMixed: ScoredMember = {
    ...gh,
    additions: 500, weightedAdditions: 350.4,
    commitImpactBreakdown: { structural: 1, functional: 3, cosmetic: 0, trivial: 0 }, commits: 4,
    fileTypeBreakdown: { source: 380, test: 40, docs: 20, style: 0, config: 20, other: 0 },
  };

  it("shows share, the stored-rule flag text and the score-driver summary, but no equal-share line", () => {
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.queryByText(/percentage points/)).not.toBeInTheDocument();
    expect(screen.queryByText(/equal share/)).not.toBeInTheDocument();
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.getByText(/More than 60%/)).toBeInTheDocument();
    expect(screen.getByText("Mostly source code")).toBeInTheDocument();
    expect(screen.getByText(/83% of added lines.*4 commits, 1 structural/)).toBeInTheDocument();
    expect(screen.queryByText(/Activity over time/)).not.toBeInTheDocument();
  });

  it("shows the flag name only when thresholds are missing", () => {
    render(<MemberDrawer {...baseProps} member={gh} thresholds={null} />);
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.queryByText(/How this flag is defined/)).not.toBeInTheDocument();
  });

  it("uses real aria-expanded buttons: Where the work went open, others closed, keyboard toggles", async () => {
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    const where = screen.getByRole("button", { name: /Where the work went/ });
    const impact = screen.getByRole("button", { name: /Commit impact/ });
    const raw = screen.getByRole("button", { name: /Raw numbers/ });
    expect(where).toHaveAttribute("aria-expanded", "true");
    expect(impact).toHaveAttribute("aria-expanded", "false");
    expect(raw).toHaveAttribute("aria-expanded", "false");
    impact.focus();
    await userEvent.keyboard("{Enter}");
    expect(impact).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard(" ");
    expect(impact).toHaveAttribute("aria-expanded", "false");
  });

  it("lists file types with lines and weight labels, with the exact multiplier in the tooltip", async () => {
    render(<MemberDrawer {...baseProps} member={ghMixed} onOpenScoringSettings={() => {}} />);
    expect(screen.getByRole("img", { name: /Source code 83%/ })).toBeInTheDocument();
    const sourceRow = screen.getByText("Source code", { selector: "td span" }).closest("tr")!;
    expect(within(sourceRow).getByText("380")).toBeInTheDocument();
    expect(within(sourceRow).getByText("High")).toBeInTheDocument();
    const configRow = screen.getByText("Config").closest("tr")!;
    expect(within(configRow).getByText("Low")).toBeInTheDocument();
    await userEvent.click(within(configRow).getByRole("button", { name: /About the weight for Config/ }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("0.3× per line.");
    expect(screen.getByText(/Generated files such as lock files are not counted \(0\.0×\)/)).toBeInTheDocument();
  });

  it("Escape closes an open tooltip only; a second Escape closes the drawer", async () => {
    const onClose = vi.fn();
    render(<MemberDrawer {...baseProps} onClose={onClose} member={ghMixed} />);
    const tip = screen.getByRole("button", { name: /About the weight for Config/ });
    await userEvent.click(tip);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes a hover-only tooltip without closing the drawer, even with focus elsewhere", async () => {
    const onClose = vi.fn();
    render(<MemberDrawer {...baseProps} onClose={onClose} member={ghMixed} />);
    await userEvent.hover(screen.getByRole("button", { name: /About the weight for Config/ }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();
    screen.getByRole("button", { name: /Where the work went/ }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens Scoring settings from the weights link", async () => {
    const onOpen = vi.fn();
    render(<MemberDrawer {...baseProps} member={ghMixed} onOpenScoringSettings={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /How weights work/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("remembers the Where the work went state, and survives storage throwing", async () => {
    const { unmount } = render(<MemberDrawer {...baseProps} member={ghMixed} />);
    await userEvent.click(screen.getByRole("button", { name: /Where the work went/ }));
    unmount();
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    expect(screen.getByRole("button", { name: /Where the work went/ })).toHaveAttribute("aria-expanded", "false");
    cleanup();

    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    const btn = screen.getByRole("button", { name: /Where the work went/ });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    get.mockRestore();
    set.mockRestore();
  });

  it("shows commit impact counts with multipliers and self-churn", async () => {
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    await userEvent.click(screen.getByRole("button", { name: /Commit impact/ }));
    expect(screen.getByText("1.5×")).toBeInTheDocument();
    expect(screen.getByText("Self-churn")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
    expect(screen.getByText(/Commit counts are log-scaled/)).toBeInTheDocument();
  });

  it("shows raw next to weighted lines with the generated-files note", async () => {
    render(<MemberDrawer {...baseProps} member={ghMixed} />);
    await userEvent.click(screen.getByRole("button", { name: /Raw numbers/ }));
    expect(screen.getByText("500 raw · 350.4 weighted")).toBeInTheDocument();
    expect(screen.getByText("Lines deleted")).toBeInTheDocument();
    expect(screen.getByText("Share of activity in the final third")).toBeInTheDocument();
    expect(screen.getByText("70.0%", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/include generated files such as lock files/)).toBeInTheDocument();
  });

  it("says breakdowns are unavailable for older reports with zeroed values", () => {
    const old = { ...gh, fileTypeBreakdown: { source: 0, test: 0, docs: 0, style: 0, config: 0, other: 0 } };
    render(<MemberDrawer {...baseProps} member={old} />);
    expect(screen.getByText(/Not available: this report predates detailed breakdowns\. Re-analyze to see them\./)).toBeInTheDocument();
  });

  it("shows a single 'Not used in this project' line for GITHUB projects", () => {
    render(<MemberDrawer {...baseProps} member={gh} />);
    expect(screen.getByText(/Not used in this project/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /FairTraze Docs activity/ })).not.toBeInTheDocument();
  });

  it("for a Docs-only member hides the GitHub sections and shows Docs details with disclosures", async () => {
    const withExtras = { ...doc, importedRetainedChars: 1200, importNote: "x", insertedImageCount: 2 };
    render(<MemberDrawer {...baseProps} source="document" member={withExtras} />);
    expect(screen.queryByRole("button", { name: /Where the work went/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Commit impact/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Raw numbers/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1,200 characters imported from \.docx/)).toBeInTheDocument();
    expect(screen.getByText(/2 images inserted/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /FairTraze Docs activity/ }));
    expect(screen.getByText("Editing sessions")).toBeInTheDocument();
    expect(screen.getByText("Churn (characters)")).toBeInTheDocument();
    expect(screen.getByText("Weighted retained characters")).toBeInTheDocument();
    expect(screen.getByText("Substantive (1.0×)")).toBeInTheDocument();
    expect(screen.getByText("Trivial (0.1×)")).toBeInTheDocument();
    expect(screen.getByText("Share of activity in the final third")).toBeInTheDocument();
    expect(screen.getByText("No flags")).toBeInTheDocument();
  });

  it("handles a combined member with a missing Docs side", async () => {
    const combined: CombinedScoredMember = {
      studentName: "Member C", userId: 3, githubUsername: "c", githubContributionShare: 0.5, documentContributionShare: 0,
      wGitHub: 0.5, wDocs: 0.5, contributionShare: 0.25, lastPhaseRatio: 0.1, flags: [], github: ghMixed, document: null,
    };
    render(<MemberDrawer {...baseProps} source="combined" member={combined} />);
    expect(screen.getByText("Blend weights (GitHub / Docs)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /FairTraze Docs activity/ }));
    expect(screen.getByText(/Not available: no Docs data/)).toBeInTheDocument();
  });
});

describe("MemberContributionList", () => {
  it("renders one 44px+ row per member with share, flag text and an equal-share marker, and opens details", async () => {
    const onOpen = vi.fn();
    render(<MemberContributionList members={[gh, { ...doc } as never]} onOpen={onOpen} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    screen.getAllByRole("button").forEach((b) => expect(b.className).toContain("min-h-10"));
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.getByText("No flags")).toBeInTheDocument();
    expect(screen.getByText(/equal share \(50\.0% each\)/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(onOpen).toHaveBeenCalledWith(gh, expect.any(HTMLElement));
  });
});
