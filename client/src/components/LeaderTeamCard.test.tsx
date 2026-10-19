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
