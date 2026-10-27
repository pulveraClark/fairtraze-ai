import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "../router";
import { StudentGroupPage } from "./StudentGroupPage";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { data: any; notes: any[]; setup: any; tasks: any[] } = { data: null, notes: [], setup: undefined, tasks: [] };

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
  useAuthOptional: () => ({ token: "t", user: { id: 1, name: "Ana Cruz", role: "STUDENT" } }),
}));
vi.mock("../hooks/useGroupQueries", () => ({
  ApiError: class ApiError extends Error { status = 0; },
  classKeys: { all: () => ["c"] },
  disputeKeys: { mine: () => ["d"] },
  groupKeys: { all: () => ["g"], detail: () => ["g", 1], setup: () => ["g", "setup", 1] },
  useGroupSetupQuery: () => ({ data: state.setup }),
  useGroupTasksQuery: () => ({ data: state.tasks }),
  useMyDisputesQuery: () => ({ data: state.notes, isPending: false }),
  useStudentGroupQuery: () => ({ data: state.data, isLoading: false, error: null }),
}));
const toast = vi.fn();
vi.mock("../components/Toast", () => ({ useToast: () => ({ showSuccessToast: toast, showToast: vi.fn() }) }));
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
    state.notes = [];
    state.setup = undefined;
    state.tasks = [];
    window.history.pushState({}, "", "/student/group/1");
  });

  const flagged = () => groupFixture({ report: { ...(groupFixture().report as object), myContribution: { ...(groupFixture().report.myContribution as object), flags: ["inactive"] } } });

  it("calls it a note everywhere a student sees it: Add a note, Send note, Note status", () => {
    window.history.pushState({}, "", REPORT);
    state.data = flagged();
    renderPage();
    expect(screen.queryByText(/dispute|Flag for review/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }));
    expect(screen.getByRole("heading", { name: "Add a note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send note" })).toBeTruthy();
  });

  it("an open note reads 'Note status: Open - awaiting review' and 'Your note is open…'", () => {
    window.history.pushState({}, "", REPORT);
    state.data = flagged();
    state.notes = [{ id: 1, projectId: 1, status: "OPEN", reason: "Offline work", instructorResponse: null, disputedFlags: '["inactive"]', createdAt: "2026-10-18T10:00:00Z", resolvedAt: null }];
    renderPage();
    expect(screen.getByText("Note status:")).toBeTruthy();
    expect(screen.getAllByText("Open - awaiting review").length).toBeGreaterThan(0);
    expect(screen.getByText("Your note is open and awaiting instructor review.")).toBeTruthy();
    expect(screen.queryByText(/dispute/i)).toBeNull();
  });

  it("shows one calm line when the report uses older scoring rules, and nothing otherwise", () => {
    window.history.pushState({}, "", REPORT);
    state.data = groupFixture({ rulesOutdated: true });
    const { unmount } = renderPage();
    expect(screen.getByText("This report uses older scoring rules. It updates when your instructor re-analyzes.")).toBeTruthy();
    unmount();
    state.data = groupFixture({ rulesOutdated: false });
    renderPage();
    expect(screen.queryByText(/older scoring rules/)).toBeNull();
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
    expect(screen.getByRole("group", { name: "About roles" }).textContent).toMatch(/labels for context and never change anyone's score/);
  });

  it("explains how evenly work is shared in a (?) tip instead of a paragraph under Team overview (P7)", () => {
    window.history.pushState({}, "", REPORT);
    renderPage();
    expect(screen.queryByText(/worked out from everyone's recorded activity/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About how evenly work is shared" }));
    expect(screen.getByRole("group", { name: "About how evenly work is shared" })).toHaveTextContent(/describes the team, not you/);
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

  it("keeps the project instructions out of the page; an Instructions button in the header opens them (12)", () => {
    const withBrief = groupFixture();
    (withBrief.assignment as { description: string | null }).description = "Build a fair grading tool.";
    state.data = withBrief;
    renderPage();
    expect(screen.queryByText("Build a fair grading tool.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Instructions" }));
    expect(screen.getByRole("dialog", { name: /Project instructions/ })).toBeTruthy();
    expect(screen.getByText("Build a fair grading tool.")).toBeTruthy();
  });

  it("shows no Instructions button when the assignment has no instructions (12)", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Instructions" })).toBeNull();
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

describe("StudentGroupPage - Set up your group", () => {
  const setup = (over = {}) => ({
    needsRepo: true, repoUrl: null, repoLinked: false, isLeader: false, canLinkRepo: true, canChangeRepo: false,
    viewerHasGithubUsername: false, usernames: { linked: 0, total: 3, missingNames: ["Ana Cruz", "Ben Lim", "Cy Dee"] }, ...over,
  });
  beforeEach(() => {
    state.data = groupFixture();
    state.notes = [];
    window.history.pushState({}, "", "/student/group/1");
  });

  it("shows one slim nudge line (not the card) while setup is incomplete", () => {
    state.setup = setup({ viewerHasGithubUsername: true });
    renderPage();
    expect(screen.getByText("Setup 0 of 3")).toBeInTheDocument();
    expect(screen.getByText("Paste the repository link")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
  });
  it("the nudge is on every tab, and Finish setup opens the steps", async () => {
    state.setup = setup();
    window.history.pushState({}, "", "/student/group/1?tab=tasks");
    renderPage();
    expect(screen.getByText("Paste the repository link")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("dialog", { name: "Finish group setup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Set up your group" })).toBeInTheDocument();
  });
  it("a leader without a repo link sees the setup screen first; Do this later is remembered and Finish setup still reopens it", async () => {
    window.localStorage.clear();
    state.setup = setup({ isLeader: true });
    const { unmount } = renderPage();
    expect(screen.getByRole("heading", { name: "Set up your group" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Do this later" }));
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
    expect(screen.getByText("Paste the repository link")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(screen.getByRole("heading", { name: "Set up your group" })).toBeInTheDocument();
    unmount();

    // A later visit: the skip is remembered, so no setup screen.
    renderPage();
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
    expect(screen.getByRole("button", { name: "Finish setup" })).toBeInTheDocument();
    window.localStorage.clear();
  });
  it("a member never gets the setup screen", () => {
    window.localStorage.clear();
    state.setup = setup({ isLeader: false });
    renderPage();
    expect(screen.queryByRole("button", { name: "Do this later" })).toBeNull();
  });
  it("is gone once all three steps are done", () => {
    state.setup = setup({ repoLinked: true, repoUrl: "https://github.com/a/b", canLinkRepo: false, usernames: { linked: 3, total: 3, missingNames: [] } });
    renderPage();
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
  });
  it("never shows for a Docs-only group", () => {
    state.setup = setup({ needsRepo: false, canLinkRepo: false });
    renderPage();
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
    expect(screen.queryByText(/GitHub repository/)).toBeNull();
  });

  const done = () => setup({ repoLinked: true, repoUrl: "https://github.com/a/b", canLinkRepo: false, usernames: { linked: 3, total: 3, missingNames: [] } });
  const task = (dueDate: string | null) => ({ id: 1, key: "FT-1", title: "Write intro", assignedToUserId: 1, status: "TODO", dueDate });

  it("setup done: the card becomes one calm Next step line from existing task data", () => {
    state.setup = done();
    const soon = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    state.tasks = [task(soon)];
    renderPage();
    expect(screen.queryByRole("heading", { name: "Set up your group" })).toBeNull();
    expect(screen.getByText("Next step")).toBeInTheDocument();
    expect(screen.getByText("You have 1 task due tomorrow")).toBeInTheDocument();
  });
  it("setup done and nothing useful to say: no line at all", () => {
    state.setup = done();
    state.tasks = [task(null)];
    renderPage();
    expect(screen.queryByText("Next step")).toBeNull();
  });
  it("while setup is incomplete there is no Next step line", () => {
    state.setup = setup();
    state.tasks = [task("2099-01-01")];
    renderPage();
    expect(screen.queryByText("Next step")).toBeNull();
  });

  it("goes from incomplete to complete in the visit: one 'Setup complete ✓' toast, never repeated", () => {
    window.localStorage.clear();
    toast.mockClear();
    state.setup = setup();
    const { rerender } = renderPage();
    expect(toast).not.toHaveBeenCalled();
    state.setup = done();
    const again = () => rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><StudentGroupPage projectId={1} /></RouterProvider>
      </QueryClientProvider>,
    );
    again();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Setup complete ✓");
    again();
    expect(toast).toHaveBeenCalledTimes(1);
    window.localStorage.clear();
  });
  it("an already-complete group (or a later visit) shows no toast and no All set line", () => {
    window.localStorage.clear();
    toast.mockClear();
    state.setup = done();
    state.tasks = [];
    renderPage();
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByText(/All set/)).toBeNull();
  });
  it("the flag stops a repeat even if the page is opened incomplete then complete again", () => {
    window.localStorage.setItem("ft.setup.completeShown.1.1", "1");
    toast.mockClear();
    state.setup = setup();
    const { rerender } = renderPage();
    state.setup = done();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider><StudentGroupPage projectId={1} /></RouterProvider>
      </QueryClientProvider>,
    );
    expect(toast).not.toHaveBeenCalled();
    window.localStorage.clear();
  });
});


describe("StudentGroupPage: member window and team overview", () => {
  const leaderFixture = (over: Record<string, unknown> = {}) => groupFixture({
    membership: { role: "LEADER", functionalRoles: ["DEVELOPER"], joinedAt: "", roleSuggestion: null },
    report: {
      ...(groupFixture().report as object),
      teamHealth: "Healthy",
      narrative: "The team shares the work fairly evenly.",
      team: [
        { userId: 1, name: "Ana Cruz", isLeader: true, functionalRoles: ["DEVELOPER"], hasAvatar: false, avatarUpdatedAt: null, contributionShare: 0.4, githubContributionShare: 0.5, documentContributionShare: 0.3, flags: [], tasks: { open: 0, done: 0 } },
        { userId: 2, name: "Ben Lim", isLeader: false, functionalRoles: ["DEVELOPER"], hasAvatar: false, avatarUpdatedAt: null, contributionShare: 0.6, githubContributionShare: 0.5, documentContributionShare: 0.7, flags: [], tasks: { open: 1, done: 1 } },
      ],
      ...over,
    },
  });
  const aiBody = {
    enabled: true, running: false, canGenerate: false, hasReport: true, generatedAt: "2026-10-26T01:00:00Z", basedOnReportAt: "2026-10-24T01:00:00Z", outdated: false,
    summaries: [
      { userId: 1, name: "Ana Cruz", githubUsername: "ana", isYou: true, summary: "Added the login page.", source: "ai", evidence: { files: [], docSections: [], commitCount: 1, otherCommits: 0 } },
      { userId: 2, name: "Ben Lim", githubUsername: "ben", isYou: false, summary: "Wrote the User Guide.", source: "ai", evidence: { files: [], docSections: [], commitCount: 0, otherCommits: 0 } },
    ],
  };
  beforeEach(() => {
    window.history.pushState({}, "", REPORT);
    state.notes = [];
    state.setup = undefined;
    state.tasks = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => aiBody }));
  });

  it("a leader opens any member's window from the Team contributions rows, with arrows, and Esc returns focus to the row", async () => {
    state.data = leaderFixture();
    renderPage();
    const row = screen.getByRole("button", { name: "Open Ben Lim's details" });
    row.focus();
    await userEvent.click(row);
    const dialog = await screen.findByRole("dialog", { name: /Ben Lim/ });
    expect(dialog).toBeTruthy();
    expect(await screen.findByText("Wrote the User Guide.")).toBeTruthy();
    expect(screen.getByText("Member 2 of 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Previous member" }));
    expect(await screen.findByText("Added the login page.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Ana Cruz|Ben Lim/ })).toBeNull();
  });

  it("a member opens only their own window: no arrows, no other member's findings", async () => {
    state.data = groupFixture();
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "See your details" }));
    expect(await screen.findByRole("dialog", { name: /Ana Cruz/ })).toBeTruthy();
    expect(await screen.findByText("Added the login page.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next member" })).toBeNull();
    expect(screen.queryByText("Wrote the User Guide.")).toBeNull();
  });

  it("the separate summary card is gone", async () => {
    state.data = leaderFixture();
    renderPage();
    await screen.findByText("Team overview");
    expect(screen.queryByText("What each member worked on")).toBeNull();
    expect(screen.queryByText("AI findings on your work")).toBeNull();
    expect(screen.queryByText("Summary of your work")).toBeNull();
  });

  it("Team overview: the evenness chip and line, the leader's AI text, then the grey last-analyzed line, in that order", async () => {
    state.data = leaderFixture();
    renderPage();
    const card = (await screen.findByText("Team overview")).closest("section")!;
    const text = card.textContent ?? "";
    const order = ["Work is evenly shared", "No one is far above or below the others.", "The team shares the work fairly evenly.", "Last analyzed"].map((t) => text.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toMatch(/Last analyzed .*\. Updates every night\./);
  });

  it("a member's Team overview has no AI text and no instructions check", async () => {
    state.data = groupFixture();
    renderPage();
    const card = (await screen.findByText("Team overview")).closest("section")!;
    expect(card.textContent).not.toContain("The team shares");
    expect(card.textContent).not.toContain("Project instructions check");
    expect(card.textContent).toMatch(/Updates every night\./);
  });
});
