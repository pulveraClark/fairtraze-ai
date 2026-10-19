import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnyScoredMember, ScoredMember, ScoringThresholds } from "@shared/types";
import { MemberDrawer } from "./MemberDrawer";
import { MemberContributionList } from "./MemberContributionList";

const thresholds: ScoringThresholds = { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 };

function member(name: string, share: number): ScoredMember {
  return {
    studentName: name, githubUsername: name.toLowerCase().replace(/\s/g, ""), commits: 4, additions: 100, deletions: 10, churn: 110, activeDays: 3,
    lastPhaseRatio: 0.3, commitShare: share, linesShare: share, activeDaysShare: share, contributionShare: share,
    codeLinesAdded: 90, commentLinesAdded: 10, blankLinesAdded: 0, codeToCommentRatio: 9, weightedAdditions: 95, selfChurnRatio: 0,
    commitImpactBreakdown: { structural: 0, functional: 4, cosmetic: 0, trivial: 0 },
    fileTypeBreakdown: { source: 90, test: 0, docs: 0, style: 0, config: 0, other: 0 },
    flags: [],
  };
}

const members: AnyScoredMember[] = [member("Member A", 0.5), member("Member B", 0.3), member("Member C", 0.2)];

/** Mirrors ProjectDetailPage: selection by name, position and neighbours from the list order. */
function Harness({ list = members, onClose }: { list?: AnyScoredMember[]; onClose?: () => void }) {
  const [name, setName] = useState<string | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const idx = name === null ? -1 : list.findIndex((m) => m.studentName === name);
  return (
    <>
      <MemberContributionList members={list} onOpen={(m, el) => { setOpener(el); setName(m.studentName); }} />
      <MemberDrawer
        member={idx >= 0 ? list[idx] : null}
        onClose={() => { onClose?.(); setName(null); }}
        restoreFocusTo={opener}
        position={idx >= 0 ? { index: idx, total: list.length } : undefined}
        onPrev={() => idx > 0 && setName(list[idx - 1].studentName)}
        onNext={() => idx >= 0 && idx < list.length - 1 && setName(list[idx + 1].studentName)}
        source="github"
        thresholds={thresholds}
        deadlineBasis="activity-span"
        memberCount={list.length}
      />
    </>
  );
}

const openRow = (n: string) => userEvent.click(screen.getByRole("button", { name: new RegExp(`^${n},`) }));
const heading = () => screen.getByRole("heading", { level: 2, name: /^Member [A-C]$/ });

describe("Member details modal: previous/next", () => {
  it("is a modal dialog named for the member and shows 'Member N of M'", async () => {
    render(<Harness />);
    await openRow("Member B");
    expect(screen.getByRole("dialog", { name: "Member B" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Member 2 of 3")).toBeInTheDocument();
  });

  it("steps through members in list order with the arrow buttons", async () => {
    render(<Harness />);
    await openRow("Member A");
    expect(heading()).toHaveTextContent("Member A");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(heading()).toHaveTextContent("Member B");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(heading()).toHaveTextContent("Member C");
    await userEvent.click(screen.getByRole("button", { name: "Previous member" }));
    expect(heading()).toHaveTextContent("Member B");
  });

  it("disables Previous on the first and Next on the last member, with no wrap-around", async () => {
    render(<Harness />);
    await openRow("Member A");
    expect(screen.getByRole("button", { name: "Previous member" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next member" })).toBeEnabled();
    await userEvent.keyboard("{ArrowLeft}");
    expect(heading()).toHaveTextContent("Member A");
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(heading()).toHaveTextContent("Member C");
    expect(screen.getByRole("button", { name: "Next member" })).toBeDisabled();
    await userEvent.keyboard("{ArrowRight}");
    expect(heading()).toHaveTextContent("Member C");
  });

  it("← and → move between members", async () => {
    render(<Harness />);
    await openRow("Member B");
    await userEvent.keyboard("{ArrowRight}");
    expect(heading()).toHaveTextContent("Member C");
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(heading()).toHaveTextContent("Member A");
  });

  it("ignores ←/→ with a modifier key, in a text field, and while a tooltip is open", async () => {
    render(<Harness />);
    await openRow("Member B");
    await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(heading()).toHaveTextContent("Member B");

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    expect(heading()).toHaveTextContent("Member B");
    input.remove();

    await userEvent.click(screen.getByRole("button", { name: /About the weight for Source code/ }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(heading()).toHaveTextContent("Member B");
  });

  it("announces the new member to screen readers", async () => {
    render(<Harness />);
    await openRow("Member A");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(screen.getByRole("status")).toHaveTextContent("Member 2 of 3: Member B");
  });

  it("keeps the dialog mounted and focus inside it when switching members", async () => {
    render(<Harness />);
    await openRow("Member A");
    const dialog = screen.getByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("button", { name: "Next member" })).toHaveFocus();
  });

  it("moves focus to the other arrow when the pressed one becomes disabled", async () => {
    render(<Harness />);
    await openRow("Member B");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(screen.getByRole("button", { name: "Next member" })).toBeDisabled();
    expect(dialogContainsFocus()).toBe(true);
    expect(screen.getByRole("button", { name: "Previous member" })).toHaveFocus();
  });

  it("resets the open/closed sections when another member is shown", async () => {
    render(<Harness />);
    await openRow("Member A");
    const impact = () => screen.getByRole("button", { name: /Commit impact/ });
    await userEvent.click(impact());
    expect(impact()).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "Next member" }));
    expect(impact()).toHaveAttribute("aria-expanded", "false");
  });

  it("Esc closes the modal and returns focus to the row that opened it", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const row = screen.getByRole("button", { name: /^Member A,/ });
    await userEvent.click(row);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("closes on a backdrop click", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await openRow("Member A");
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows no arrows or position for a single-member group", async () => {
    render(<Harness list={[members[0]]} />);
    await openRow("Member A");
    expect(screen.queryByRole("button", { name: "Next member" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Member 1 of 1/)).not.toBeInTheDocument();
  });

  it("renders the same content as before for the selected member (no extra scoring text)", async () => {
    render(<Harness />);
    await openRow("Member B");
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("30.0%")).toBeInTheDocument();
    expect(dialog.getByText("No flags")).toBeInTheDocument();
  });
});

function dialogContainsFocus(): boolean {
  return !!document.activeElement && screen.getByRole("dialog").contains(document.activeElement);
}

describe("Member details modal: two-column layout", () => {
  const side = () => within(screen.getByTestId("modal-sidebar"));
  const main = () => within(screen.getByTestId("modal-main"));

  it("puts share, equal share, summary and flags in the left column, and the four sections on the right", async () => {
    const withFlag = [{ ...members[0], flags: ["deadline-driven"] } as AnyScoredMember, members[1], members[2]];
    render(<Harness list={withFlag} />);
    await openRow("Member A");
    expect(side().getByText("Contribution share")).toBeInTheDocument();
    expect(side().getByText("Equal share for 3 members: 33.3%")).toBeInTheDocument();
    expect(side().getByRole("heading", { name: "Flags" })).toBeInTheDocument();
    expect(side().getByText("Deadline-driven")).toBeInTheDocument();
    expect(main().getByRole("button", { name: /Where the work went/ })).toBeInTheDocument();
    expect(main().getByRole("button", { name: /Commit impact/ })).toBeInTheDocument();
    expect(main().getByRole("button", { name: /Raw numbers/ })).toBeInTheDocument();
    expect(main().getByText(/FairTraze Docs activity/)).toBeInTheDocument();
    expect(side().queryByText(/FairTraze Docs activity/)).not.toBeInTheDocument();
    expect(side().queryByRole("button", { name: /Where the work went|Commit impact|Raw numbers/ })).not.toBeInTheDocument();
  });

  it("is one scroll area: the sidebar is sticky from lg with a 320px column, and neither column scrolls on its own below lg", async () => {
    render(<Harness />);
    await openRow("Member A");
    const sidebar = screen.getByTestId("modal-sidebar");
    const grid = sidebar.parentElement!;
    expect(grid.className).toContain("lg:grid-cols-[320px_minmax(0,1fr)]");
    expect(grid.className).toContain("overflow-y-auto");
    expect(sidebar.className).toContain("bg-slate-50");
    const sticky = sidebar.firstElementChild as HTMLElement;
    expect(sticky.className).toContain("lg:sticky");
    expect(sticky.className).toContain("lg:top-0");
    expect(sticky.className).toContain("lg:self-start");
    expect(sticky.className).toContain("lg:overflow-y-auto");
    expect(sticky.className).not.toMatch(/(^|\s)overflow-y-auto/);
    expect(screen.getByTestId("modal-main").className).not.toContain("overflow");
  });

  it("keeps the summary before the details in DOM order so the single-column reading order is share, flags, sections", async () => {
    render(<Harness />);
    await openRow("Member A");
    const sidebar = screen.getByTestId("modal-sidebar");
    const mainCol = screen.getByTestId("modal-main");
    expect(sidebar.compareDocumentPosition(mainCol) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no equal-share line when the group size is unknown", async () => {
    render(<Harness />);
    render(<MemberDrawer member={members[0]} onClose={() => {}} source="github" thresholds={thresholds} deadlineBasis="activity-span" memberCount={0} />);
    expect(screen.queryByText(/Equal share for/)).not.toBeInTheDocument();
  });

  it("keeps the sections collapsible by keyboard", async () => {
    render(<Harness />);
    await openRow("Member A");
    const raw = main().getByRole("button", { name: /Raw numbers/ });
    raw.focus();
    await userEvent.keyboard("{Enter}");
    expect(raw).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the Tasks line in the left column with a muted planning-only note under it", async () => {
    const info = { userId: 1, githubUsername: members[0].githubUsername, functionalRoles: [], isLeader: false, mismatchNotes: [], taskSummary: { completed: 2, total: 5 } };
    render(
      <MemberDrawer
        member={members[0]} onClose={() => {}} source="github" thresholds={thresholds} deadlineBasis="activity-span" memberCount={3}
        memberRoles={[info as never]}
      />,
    );
    expect(side().getByText("2 of 5 completed", { exact: false })).toBeInTheDocument();
    const note = side().getByText("Planning only. Not part of the score.");
    expect(note.className).toContain("text-xs");
    expect(note.previousElementSibling).toHaveTextContent("Tasks: 2 of 5 completed");
    expect(main().queryByText(/Planning only/)).not.toBeInTheDocument();
  });

  it("omits the Tasks line and its note when the member has no tasks", async () => {
    const info = { userId: 1, githubUsername: members[0].githubUsername, functionalRoles: [], isLeader: false, mismatchNotes: [], taskSummary: { completed: 0, total: 0 } };
    render(
      <MemberDrawer
        member={members[0]} onClose={() => {}} source="github" thresholds={thresholds} deadlineBasis="activity-span" memberCount={3}
        memberRoles={[info as never]}
      />,
    );
    expect(screen.queryByText(/Planning only/)).not.toBeInTheDocument();
  });
});
