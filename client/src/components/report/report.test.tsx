import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CombinedScoredMember, DocumentScoredMember, ScoredMember, ScoringThresholds } from "@shared/types";
import { MemberDrawer } from "./MemberDrawer";
import { MemberContributionList } from "./MemberContributionList";
import { LorenzCard } from "./LorenzCard";

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
  it("shows share, difference from equal share, flag with its stored-rule text, and GitHub counts", () => {
    render(<MemberDrawer {...baseProps} member={gh} />);
    expect(screen.getByText("40.0%")).toBeInTheDocument();
    expect(screen.getByText(/6\.7 percentage points above the equal share \(33\.3% each\)/)).toBeInTheDocument();
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.getByText(/How this flag is defined/)).toBeInTheDocument();
    expect(screen.getByText(/More than 60%/)).toBeInTheDocument();
    expect(screen.getByText("Commits")).toBeInTheDocument();
    // No docs data on a GitHub-only report, and no dates are stored.
    const docs = screen.getByRole("heading", { name: "FairTraze Docs activity" }).closest("section")!;
    expect(within(docs).getByText(/Not available/)).toBeInTheDocument();
    const time = screen.getByRole("heading", { name: "Activity over time" }).closest("section")!;
    expect(within(time).getByText(/Not available/)).toBeInTheDocument();
    expect(within(time).getByText("70.0%")).toBeInTheDocument();
  });

  it("shows the flag name only when thresholds are missing", () => {
    render(<MemberDrawer {...baseProps} member={gh} thresholds={null} />);
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.queryByText(/How this flag is defined/)).not.toBeInTheDocument();
  });

  it("marks GitHub as not available for a Docs-only member", () => {
    render(<MemberDrawer {...baseProps} source="document" member={doc} />);
    const ghSection = screen.getByRole("heading", { name: "GitHub activity" }).closest("section")!;
    expect(within(ghSection).getByText(/Not available/)).toBeInTheDocument();
    expect(screen.getByText("Editing sessions")).toBeInTheDocument();
    expect(screen.getByText("No flags")).toBeInTheDocument();
  });

  it("handles a combined member with a missing source side", () => {
    const combined: CombinedScoredMember = {
      studentName: "Member C", userId: 3, githubUsername: "c", githubContributionShare: 0.5, documentContributionShare: 0,
      wGitHub: 0.5, wDocs: 0.5, contributionShare: 0.25, lastPhaseRatio: 0.1, flags: [], github: gh, document: null,
    };
    render(<MemberDrawer {...baseProps} source="combined" member={combined} />);
    expect(screen.getByText("Blend weights (GitHub / Docs)")).toBeInTheDocument();
    const docs = screen.getByRole("heading", { name: "FairTraze Docs activity" }).closest("section")!;
    expect(within(docs).getByText(/Not available/)).toBeInTheDocument();
  });
});

describe("MemberContributionList", () => {
  it("renders one 44px+ row per member with share, flag text and an equal-share marker, and opens details", async () => {
    const onOpen = vi.fn();
    render(<MemberContributionList members={[gh, { ...doc } as never]} onOpen={onOpen} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    screen.getAllByRole("button").forEach((b) => expect(b.className).toContain("min-h-11"));
    expect(screen.getByText("Deadline-driven")).toBeInTheDocument();
    expect(screen.getByText("No flags")).toBeInTheDocument();
    expect(screen.getByText(/equal share \(50\.0% each\)/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button")[0]);
    expect(onOpen).toHaveBeenCalledWith(gh, expect.any(HTMLElement));
  });
});

describe("LorenzCard", () => {
  it("shows the stored Gini as given and offers a text/table alternative", () => {
    render(<LorenzCard shares={[0.1, 0.2, 0.7]} gini={0.412} />);
    expect(screen.getByText(/Gini coefficient: 0\.412/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Lorenz curve/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Lorenz curve points" })).toBeInTheDocument();
  });
});
