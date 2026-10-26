import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ScoredMember } from "@shared/types";
import { MemberContributionList } from "./MemberContributionList";

const m: ScoredMember = {
  studentName: "Member A", githubUsername: "a", commits: 12, additions: 400, deletions: 50, churn: 450, activeDays: 5,
  lastPhaseRatio: 0.7, commitShare: 0.3, linesShare: 0.3, activeDaysShare: 0.3, contributionShare: 0.4,
  codeLinesAdded: 380, commentLinesAdded: 20, blankLinesAdded: 0, codeToCommentRatio: 19,
  weightedAdditions: 350, selfChurnRatio: 0.1,
  commitImpactBreakdown: { structural: 0, functional: 12, cosmetic: 0, trivial: 0 },
  fileTypeBreakdown: { source: 380, test: 0, docs: 0, style: 0, config: 0, other: 0 },
  flags: [],
};

describe("AI summaries chip in the Member contributions header", () => {
  it("is plain text (not a button) in the ready, not-generated and writing states", () => {
    const { rerender } = render(<MemberContributionList members={[m]} onOpen={() => {}} aiSummaryState="ready" />);
    expect(screen.getByText("✓ AI summaries ready").closest("button")).toBeNull();
    rerender(<MemberContributionList members={[m]} onOpen={() => {}} aiSummaryState="none" />);
    expect(screen.getByText("AI summaries not generated yet")).toBeTruthy();
    rerender(<MemberContributionList members={[m]} onOpen={() => {}} aiSummaryState="running" />);
    expect(screen.getByText("Writing AI summaries…")).toBeTruthy();
  });

  it("is hidden when AI review is off or the viewer is not the instructor (state null or omitted)", () => {
    const { rerender } = render(<MemberContributionList members={[m]} onOpen={() => {}} aiSummaryState={null} />);
    expect(screen.queryByText(/AI summaries/)).toBeNull();
    rerender(<MemberContributionList members={[m]} onOpen={() => {}} />);
    expect(screen.queryByText(/AI summaries/)).toBeNull();
  });
});
