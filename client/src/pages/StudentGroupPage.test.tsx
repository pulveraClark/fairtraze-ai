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

const REPORT = "/student/group/1?tab=report";

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
    window.history.pushState({}, "", REPORT);
    state.data = groupFixture({ membership: { role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "", roleSuggestion: null } });
    renderPage();
    expect(screen.queryByText(/Assign roles for all members/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About roles" }));
    expect(screen.getByRole("tooltip").textContent).toMatch(/Assign roles for all members/);
  });

  it("has no hero card; a member sees one compact 'Your share' tile (R4)", () => {
    window.history.pushState({}, "", REPORT);
    renderPage();
    expect(screen.queryByText("Your contribution share")).toBeNull();
    expect(screen.getAllByText("Your share")).toHaveLength(1);
    expect(screen.getByText("40.0%")).toBeTruthy();
    expect(screen.getByTestId("share-bar-tick")).toBeTruthy();
  });

  it("a leader gets no tile and no hero card; their own row is marked You (R4)", () => {
    window.history.pushState({}, "", REPORT);
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

  it("keeps the project brief out of the page; a Brief link in the header opens it (12)", () => {
    const withBrief = groupFixture();
    (withBrief.assignment as { description: string | null }).description = "Build a fair grading tool.";
    state.data = withBrief;
    renderPage();
    expect(screen.queryByText("Build a fair grading tool.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Brief" }));
    expect(screen.getByRole("dialog", { name: /Project brief/ })).toBeTruthy();
    expect(screen.getByText("Build a fair grading tool.")).toBeTruthy();
  });

  it("shows no Brief link when the assignment has no brief (12)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Brief" })).toBeNull();
  });

  it("tabs read FairTraze Docs, Tasks, Report and open on Docs (17)", () => {
    renderPage();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["FairTraze Docs", "Tasks", "Report"]);
    expect(screen.getByRole("tab", { name: "FairTraze Docs" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("docs-editor")).toBeTruthy();
  });

  it("?tab= links still land on the named tab (17)", () => {
    window.history.pushState({}, "", "/student/group/1?tab=tasks");
    renderPage();
    expect(screen.getByRole("tab", { name: "Tasks" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("tasks-board")).toBeTruthy();
  });

  it("choosing the Report tab puts ?tab=report in the address so a reload stays there (17)", () => {
    renderPage();
    fireEvent.click(screen.getByRole("tab", { name: "Report" }));
    expect(window.location.search).toContain("tab=report");
    expect(screen.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true");
  });

  it("a GitHub-only project has Tasks then Report (17)", () => {
    state.data = groupFixture({ assignment: { id: 9, title: "P", deadline: null, sourceType: "GITHUB", description: null, attachments: [] } });
    renderPage();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Tasks", "Report"]);
  });

  it("Combined report: no weight tiles, one muted 'Score blend' line (18)", () => {
    window.history.pushState({}, "", REPORT);
    renderPage();
    expect(screen.queryByText("GitHub Weight")).toBeNull();
    expect(screen.queryByText("Docs Weight")).toBeNull();
    expect(screen.getByText("GitHub Share")).toBeTruthy();
    expect(screen.getByText("Docs Share")).toBeTruthy();
    expect(screen.getByText("Score blend: 50% GitHub / 50% Docs")).toBeTruthy();
  });

  it("a student's own free-rider flag reads 'Low contribution' in a soft warning tone (20)", () => {
    window.history.pushState({}, "", REPORT);
    const f = groupFixture();
    (f.report as { myContribution: { flags: string[] } }).myContribution.flags = ["free-rider"];
    state.data = f;
    renderPage();
    const tag = screen.getByText("Low contribution").closest("span")!;
    expect(tag.className).toContain("bg-amber-50");
    expect(screen.queryByText("free-rider")).toBeNull();
  });

  it("hides the Gini and says 'Work is a bit uneven' instead of Moderate Risk, for members (21)", () => {
    window.history.pushState({}, "", REPORT);
    renderPage();
    expect(screen.queryByText(/Gini/i)).toBeNull();
    expect(screen.queryByText("0.30")).toBeNull();
    expect(screen.queryByText(/Moderate Risk/)).toBeNull();
    expect(screen.getAllByText("Work is a bit uneven").length).toBeGreaterThan(0);
  });

  it("applies to the leader too (21)", () => {
    window.history.pushState({}, "", REPORT);
    state.data = groupFixture({ membership: { role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "", roleSuggestion: null } });
    renderPage();
    expect(screen.queryByText(/Gini/i)).toBeNull();
    expect(screen.queryByText(/Moderate Risk|High Risk/)).toBeNull();
    expect(screen.getAllByText("Work is a bit uneven").length).toBeGreaterThan(0);
  });

  it("the breadcrumb shows the subject code only, with SUBJECT CODE · EDP as its tooltip (I12)", () => {
    renderPage();
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(crumbs.textContent).toContain("IT-ELEC 2");
    expect(crumbs.textContent).not.toContain("UXA634062");
    expect(screen.getByRole("link", { name: "IT-ELEC 2" })).toHaveAttribute("title", "IT-ELEC 2 · EDP UXA634062");
  });
});
