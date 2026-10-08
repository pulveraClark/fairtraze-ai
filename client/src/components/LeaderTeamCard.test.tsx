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
  it("shows shares, the GitHub/Docs split for COMBINED, task counts and the fairness note", () => {
    render(<LeaderTeamCard sourceType="COMBINED" team={[member({}), member({ userId: 2, name: "Member B", contributionShare: null, githubContributionShare: null, documentContributionShare: null })]} />);
    expect(screen.getByText(/distributing work fairly/i)).toBeTruthy();
    expect(screen.getByText("60.0%")).toBeTruthy();
    expect(screen.getByText(/GitHub 70.0% · Docs 50.0%/)).toBeTruthy();
    expect(screen.getAllByText(/Tasks: 2 open · 1 done/)).toHaveLength(2);
    expect(screen.getByText("—")).toBeTruthy(); // member missing from the report
  });

  it("omits the GitHub/Docs split for single-source assignments", () => {
    render(<LeaderTeamCard sourceType="GITHUB" team={[member({})]} />);
    expect(screen.queryByText(/Docs/)).toBeNull();
  });
});
