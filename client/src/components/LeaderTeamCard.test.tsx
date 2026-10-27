import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaderTeamCard, type LeaderTeamMember } from "./LeaderTeamCard";

vi.mock("../context/AuthContext", () => ({ useAuthOptional: () => ({ token: "tok" }) }));

const member = (o: Partial<LeaderTeamMember>): LeaderTeamMember => ({
  userId: 1, name: "Member A", isLeader: false, functionalRoles: ["DEVELOPER"], hasAvatar: false,
  avatarUpdatedAt: null, contributionShare: 0.6, githubContributionShare: 0.7, documentContributionShare: 0.5,
  flags: [], tasks: { open: 2, done: 1 }, ...o,
});

describe("LeaderTeamCard", () => {
  it("shows shares, the GitHub/Docs split for COMBINED, task counts and the fairness note (the note is a (?) tip)", async () => {
    render(<LeaderTeamCard sourceType="COMBINED" team={[member({}), member({ userId: 2, name: "Member B", contributionShare: null, githubContributionShare: null, documentContributionShare: null })]} />);
    expect(screen.getByText("Equal share: 50.0% each.")).toBeTruthy();
    expect(screen.queryByText(/not grades/i)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "About the team contributions view" }));
    expect(screen.getByRole("group", { name: "About the team contributions view" })).toHaveTextContent(/not grades/i);
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText(/GitHub 70.0% · Docs 50.0%/)).toBeTruthy();
    expect(screen.getAllByText(/Tasks: 1 of 3 done/)).toHaveLength(2);
    expect(screen.getByText("—")).toBeTruthy(); // member missing from the report
  });

  it("omits the GitHub/Docs split for single-source assignments", () => {
    render(<LeaderTeamCard sourceType="GITHUB" team={[member({})]} />);
    expect(screen.queryByText(/Docs/)).toBeNull();
  });
});

describe("LeaderTeamCard share bars (18)", () => {
  it("draws a small bar per member with the equal-share tick, and none for a member missing from the report or in a no-activity group", () => {
    const { rerender } = render(<LeaderTeamCard sourceType="GITHUB" team={[member({ contributionShare: 0.6 }), member({ userId: 2, name: "Member B", contributionShare: null })]} />);
    expect(screen.getAllByTestId("share-bar")).toHaveLength(1);
    expect(screen.getByTestId("share-bar-fill")).toHaveStyle({ width: "60%" });
    expect(screen.getByTestId("share-bar-tick")).toHaveStyle({ left: "50%" });
    rerender(<LeaderTeamCard sourceType="GITHUB" noActivity team={[member({})]} />);
    expect(screen.queryByTestId("share-bar")).toBeNull();
  });
});

describe("LeaderTeamCard task wording (19)", () => {
  it("says 'No tasks' for a member with none, and never 'open' or 'completed'", () => {
    render(<LeaderTeamCard sourceType="GITHUB" team={[member({ tasks: { open: 0, done: 0 } })]} />);
    expect(screen.getByText("No tasks")).toBeTruthy();
    expect(screen.queryByText(/open|completed/)).toBeNull();
  });
});

describe("LeaderTeamCard flags for a peer (20)", () => {
  it("shows a teammate's flag as 'Low contribution' in grey, never as free-rider or red; the viewer's own stays amber", () => {
    render(<LeaderTeamCard sourceType="GITHUB" currentUserId={1} team={[
      member({ userId: 1, name: "Member A", flags: ["free-rider"] }),
      member({ userId: 2, name: "Member B", flags: ["inactive", "free-rider"] }),
    ]} />);
    expect(screen.queryByText(/free-rider|inactive/i)).toBeNull();
    const tags = screen.getAllByText("Low contribution");
    expect(tags).toHaveLength(2); // one per member: Member B's two flags collapse into one
    const own = tags[0]!.closest("span")!;
    const peer = tags[1]!.closest("span")!;
    expect(own.className).toContain("bg-amber-50");
    expect(peer.className).toContain("bg-slate-100");
    expect(peer.className).not.toMatch(/red/);
  });
});

describe("LeaderTeamCard own row", () => {
  it("marks only the signed-in member's row with 'You'", () => {
    render(<LeaderTeamCard sourceType="GITHUB" currentUserId={2} team={[member({}), member({ userId: 2, name: "Member B" })]} />);
    const you = screen.getAllByText("You");
    expect(you).toHaveLength(1);
    expect(you[0]!.closest("li")!.textContent).toContain("Member B");
  });
});

describe("LeaderTeamCard with no recorded activity", () => {
  it("shows no shares or inactive pills, but keeps names and task counts", () => {
    render(<LeaderTeamCard sourceType="COMBINED" noActivity team={[
      member({ contributionShare: 0, flags: ["inactive"] }),
      member({ userId: 2, name: "Member B", contributionShare: 0, flags: ["inactive"] }),
    ]} />);
    expect(screen.getAllByText("Not enough activity yet")).toHaveLength(2);
    expect(screen.queryByText(/inactive/i)).toBeNull();
    expect(screen.queryByText("0.0%")).toBeNull();
    expect(screen.getAllByText(/Tasks: 1 of 3 done/)).toHaveLength(2);
    expect(screen.getByText("Member B")).toBeTruthy();
  });
});

describe("LeaderTeamCard GitHub/Docs split bar", () => {
  const blend = { wGitHub: 0.5, wDocs: 0.5 };
  const m = (o: Partial<LeaderTeamMember> = {}) => member({ contributionShare: 0.299, githubContributionShare: 0.48, documentContributionShare: 0.118, ...o });
  const width = (el: HTMLElement) => parseFloat(el.style.width);

  it("segments are wGitHub x GitHub share and wDocs x Docs share, and add up to the combined share within rounding", () => {
    for (const [b, g, d] of [[{ wGitHub: 0.5, wDocs: 0.5 }, 0.48, 0.118], [{ wGitHub: 0.7, wDocs: 0.3 }, 0.9, 0.05], [{ wGitHub: 0.4, wDocs: 0.6 }, 0.2, null]] as const) {
      const combined = b.wGitHub * g + b.wDocs * (d ?? 0);
      const { unmount } = render(<LeaderTeamCard sourceType="COMBINED" blend={b} team={[member({ contributionShare: combined, githubContributionShare: g, documentContributionShare: d })]} />);
      const gh = width(screen.getByTestId("share-bar-github")), dc = width(screen.getByTestId("share-bar-docs"));
      expect(gh).toBeCloseTo(b.wGitHub * g * 100, 5);
      expect(dc).toBeCloseTo(b.wDocs * (d ?? 0) * 100, 5);
      expect(Math.abs(gh + dc - combined * 100)).toBeLessThan(0.05);
      unmount();
    }
  });

  it("labels the bar for screen readers and keeps the tick above the fills", () => {
    render(<LeaderTeamCard sourceType="COMBINED" blend={{ wGitHub: 0.5, wDocs: 0.5 }} team={[member({ contributionShare: 0.299, githubContributionShare: 0.48, documentContributionShare: 0.118 })]} />);
    expect(screen.getByRole("img", { name: "GitHub 24.0 points, Docs 5.9 points, total 29.9 percent" })).toBeTruthy();
    const bar = screen.getByTestId("share-bar");
    const children = [...bar.children];
    expect(children.indexOf(screen.getByTestId("share-bar-tick").parentElement!)).toBeGreaterThan(children.indexOf(screen.getByTestId("share-bar-github").parentElement!));
    expect(screen.getByTestId("share-bar-tick")).toHaveStyle({ left: "100%" });
  });

  it("shows the legend (not hidden) and keeps the text label with a square in front of each source", () => {
    render(<LeaderTeamCard sourceType="COMBINED" blend={blend} team={[m()]} />);
    const legend = screen.getAllByText("GitHub")[0]!.parentElement!;
    expect(legend.closest("[aria-hidden='true']")).toBeNull();
    expect(legend).toHaveTextContent("GitHubDocs");
    expect(legend.querySelectorAll("span[aria-hidden='true']")).toHaveLength(2);
    expect(screen.getByText(/GitHub 48.0% · Docs 11.8%/)).toBeTruthy();
  });

  it("draws one color and one legend entry when a source has weight 0", () => {
    render(<LeaderTeamCard sourceType="COMBINED" blend={{ wGitHub: 1, wDocs: 0 }} team={[m({ contributionShare: 0.48 })]} />);
    expect(screen.getByTestId("share-bar-github")).toBeTruthy();
    expect(screen.queryByTestId("share-bar-docs")).toBeNull();
    expect(screen.getByRole("img", { name: "GitHub 48.0 points, total 48.0 percent" })).toBeTruthy();
    expect(screen.queryByText("Docs")).toBeNull();
    expect(screen.queryByText(/Docs 11.8%/)).toBeNull();
  });

  it("falls back to the plain bar and no legend without usable weights, and for single-source cards", () => {
    const { rerender } = render(<LeaderTeamCard sourceType="COMBINED" team={[m()]} />);
    expect(screen.getByTestId("share-bar-fill")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<LeaderTeamCard sourceType="GITHUB" blend={blend} team={[m()]} />);
    expect(screen.getByTestId("share-bar-fill")).toBeTruthy();
    expect(screen.queryByText("Docs")).toBeNull();
  });
});
