import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { StudentGroupPage } from "./StudentGroupPage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { data: any } = { data: null };

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
  useAuthOptional: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
}));
vi.mock("../hooks/useGroupQueries", () => ({
  ApiError: class ApiError extends Error { status = 0; },
  classKeys: { all: () => ["c"] },
  disputeKeys: { mine: () => ["d"] },
  groupKeys: { all: () => ["g"], detail: () => ["g", 1] },
  useGroupTasksQuery: () => ({ data: [] }),
  useMyDisputesQuery: () => ({ data: [], isPending: false }),
  useStudentGroupQuery: () => ({ data: state.data, isLoading: false, error: null }),
}));
vi.mock("../hooks/useInvalidateOnAlertCount", () => ({ useInvalidateOnAlertCount: () => undefined }));
vi.mock("../components/tasks/TasksTab", () => ({ TasksTab: () => <div>tasks-board</div> }));
vi.mock("../components/DocumentGate", () => ({ DocumentGate: () => <div>docs-editor</div> }));
vi.mock("../components/GroupManageModal", () => ({ GroupManageModal: () => <div>manage-modal</div> }));

export function groupFixture(over: Record<string, unknown> = {}) {
  return {
    classSection: { id: 5, subjectCode: "IT-ELEC 2", subjectName: "Electives", department: null, edpCode: "UXA634062" },
    assignment: { id: 9, title: "Project", deadline: null, sourceType: "COMBINED", description: null, attachments: [] },
    project: { id: 1, groupName: "Group 1", repoUrl: "" },
    membership: { role: "MEMBER", functionalRoles: ["DEVELOPER"], joinedAt: "2026-10-01T00:00:00Z", roleSuggestion: null },
    hasReport: true,
    report: {
      gini: 0.3, teamHealth: "Moderate Risk", analyzedAt: "2026-10-18T00:00:00Z", memberCount: 3,
      deadlineWindowBasis: "activity-span",
      myContribution: {
        sourceType: "COMBINED", contributionShare: 0.4, githubContributionShare: 0.5, documentContributionShare: 0.3,
        wGitHub: 0.5, wDocs: 0.5, flags: [], commits: 3, activeDays: 2,
      },
    },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider><StudentGroupPage projectId={1} /></RouterProvider>
    </QueryClientProvider>,
  );
}

describe("StudentGroupPage", () => {
  beforeEach(() => {
    state.data = groupFixture();
    window.history.pushState({}, "", "/student/group/1");
  });

  it("has no header Tasks button; Tasks stays a tab (R1)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /^Tasks$/ })).toBeNull();
    expect(screen.getByRole("tab", { name: "Tasks" })).toBeTruthy();
  });

  it("leader's role helper sentence lives in a (?) tooltip, not on the page (R3)", () => {
    state.data = groupFixture({ membership: { role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "", roleSuggestion: null } });
    renderPage();
    expect(screen.queryByText(/Assign roles for all members/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About roles" }));
    expect(screen.getByRole("tooltip").textContent).toMatch(/Assign roles for all members/);
  });

  it("has no hero card; a member sees one compact 'Your share' tile (R4)", () => {
    renderPage();
    expect(screen.queryByText("Your contribution share")).toBeNull();
    expect(screen.getAllByText("Your share")).toHaveLength(1);
    expect(screen.getByText("40.0%")).toBeTruthy();
    expect(screen.getByTestId("share-bar-tick")).toBeTruthy();
  });

  it("a leader gets no tile and no hero card; their own row is marked You (R4)", () => {
    state.data = groupFixture({
      membership: { role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "", roleSuggestion: null },
      report: {
        ...(groupFixture().report as object),
        team: [
          { userId: 1, name: "Ana Cruz", isLeader: true, functionalRoles: ["DEVELOPER"], hasAvatar: false, avatarUpdatedAt: null, contributionShare: 0.4, githubContributionShare: 0.5, documentContributionShare: 0.3, flags: [], tasks: { open: 0, done: 0 } },
          { userId: 2, name: "Ben Lim", isLeader: false, functionalRoles: ["DEVELOPER"], hasAvatar: false, avatarUpdatedAt: null, contributionShare: 0.6, githubContributionShare: 0.5, documentContributionShare: 0.7, flags: [], tasks: { open: 0, done: 0 } },
        ],
      },
    });
    renderPage();
    expect(screen.queryByText("Your contribution share")).toBeNull();
    expect(screen.queryByText("Your share")).toBeNull();
    expect(screen.getAllByText("You")).toHaveLength(1);
  });
});
