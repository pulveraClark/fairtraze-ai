import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AssignmentTaskSummary, BoardResponse, WorkloadResponse } from "@shared/taskTypes";
import * as AuthContextModule from "../../context/AuthContext";
import * as RouterModule from "../../router";
import { ToastProvider } from "../Toast";
import { TasksTab } from "./TasksTab";
import { WorkloadPanel } from "./WorkloadPanel";
import { GroupTaskCards } from "../GroupTaskCards";
import { mkBoard, mkTask, resetFixtureIds } from "../../../test/taskFixtures";

vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

const navigate = vi.fn();
vi.mock("../../router", async () => {
  const actual = await vi.importActual<typeof RouterModule>("../../router");
  return { ...actual, useRouter: () => ({ pathname: "/", navigate }) };
});

function signInAs(id: number, systemRole: "STUDENT" | "INSTRUCTOR" | "ADMIN" = "STUDENT") {
  mockUseAuth.mockReturnValue({
    user: { id, email: "a@example.com", name: "Someone", systemRole },
    token: "t", loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
}

function serve(routes: Record<string, () => { status: number; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    calls.push(key);
    const r = routes[key]?.() ?? { status: 404, body: { error: "unhandled" } };
    return { ok: r.status < 400, status: r.status, json: async () => structuredClone(r.body) };
  }));
  return calls;
}

const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>);
};

const WORKLOAD: WorkloadResponse = {
  groupId: 7,
  today: "2026-10-18",
  members: [
    { userId: 2, name: "Ben Cruz", open: 4, overdue: 2, dueThisWeek: 1, inReview: 1, done: 3 },
    { userId: 1, name: "Leader Lee", open: 0, overdue: 0, dueThisWeek: 0, inReview: 0, done: 5 },
  ],
  unassigned: { open: 2, overdue: 0 },
};

beforeEach(() => { resetFixtureIds(); navigate.mockReset(); window.history.replaceState({}, "", "/"); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState({}, "", "/"); });

describe("WorkloadPanel", () => {
  it("shows open, overdue, due this week, in review and done per member, plus unassigned, with the planning-only note", async () => {
    signInAs(1);
    serve({ "GET /api/groups/7/tasks/workload": () => ({ status: 200, body: WORKLOAD }) });
    wrap(<WorkloadPanel projectId={7} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: "Workload" });
    expect(within(dialog).getByText("Open tasks per member. Planning only. Not part of the contribution score.")).toBeInTheDocument();
    const table = await within(dialog).findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Member", "Open", "Overdue", "Due this week", "In review", "Done"]);

    const ben = within(table).getByRole("row", { name: /Ben Cruz/ });
    expect(within(ben).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "2 overdue", "1", "1", "3"]);
    // Overdue is text plus an icon, never color alone.
    expect(ben.querySelector("svg")).not.toBeNull();
    const lee = within(table).getByRole("row", { name: /Leader Lee/ });
    expect(lee.querySelector("svg")).toBeNull();
    expect(within(table).getByRole("row", { name: /Unassigned/ })).toHaveTextContent("2");
  });

  it("closes with Esc and the Close button, and explains an error", async () => {
    signInAs(1);
    serve({ "GET /api/groups/7/tasks/workload": () => ({ status: 403, body: { error: "Only the group leader can see the workload." } }) });
    const onClose = vi.fn();
    wrap(<WorkloadPanel projectId={7} onClose={onClose} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the group leader can see the workload.");
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Workload button in the Tasks tab", () => {
  const leader = (over: Partial<BoardResponse["viewer"]> = {}) => ({ userId: 1, isLeader: true, isMember: true, readOnly: false, canCreate: true, canManageBoard: true, ...over });
  const boardCall = (b: BoardResponse) => ({ "GET /api/groups/7/tasks": () => ({ status: 200, body: b }) });

  it("the leader sees it and it opens the panel", async () => {
    signInAs(1);
    serve({ ...boardCall(mkBoard({}, [mkTask({ id: 1 })])), "GET /api/groups/7/tasks/workload": () => ({ status: 200, body: WORKLOAD }) });
    wrap(<TasksTab projectId={7} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Workload" }));
    expect(await screen.findByRole("dialog", { name: "Workload" })).toBeInTheDocument();
  });

  it("the instructor (read-only) sees it; an ordinary member does not", async () => {
    signInAs(50, "INSTRUCTOR");
    serve(boardCall(mkBoard({ viewer: leader({ userId: 50, isLeader: false, isMember: false, readOnly: true, canCreate: false, canManageBoard: false }) }, [mkTask({ id: 1 })])));
    const first = wrap(<TasksTab projectId={7} />);
    expect(await screen.findByRole("button", { name: "Workload" })).toBeInTheDocument();
    first.unmount();

    signInAs(2);
    serve(boardCall(mkBoard({ viewer: leader({ userId: 2, isLeader: false, canManageBoard: false }) }, [mkTask({ id: 1 })])));
    wrap(<TasksTab projectId={7} />);
    await screen.findByRole("button", { name: "New task" });
    expect(screen.queryByRole("button", { name: "Workload" })).not.toBeInTheDocument();
  });

  it("?workload=1 opens the panel on arrival (the class page's Workload button)", async () => {
    window.history.replaceState({}, "", "/project/7?tab=tasks&workload=1");
    signInAs(1);
    serve({ ...boardCall(mkBoard({}, [mkTask({ id: 1 })])), "GET /api/groups/7/tasks/workload": () => ({ status: 200, body: WORKLOAD }) });
    wrap(<TasksTab projectId={7} />);
    expect(await screen.findByRole("dialog", { name: "Workload" })).toBeInTheDocument();
  });
});

describe("GroupTaskCards (class page)", () => {
  const SUMMARY: AssignmentTaskSummary = {
    assignmentId: 3,
    groups: [
      {
        projectId: 11, groupName: "Group Alpha", total: 8, done: 3, overdue: 2,
        milestones: [{ id: 1, name: "Alpha release", dueDate: "2026-11-20", total: 4, done: 1 }],
      },
      { projectId: 12, groupName: "Group Beta", total: 0, done: 0, overdue: 0, milestones: [] },
      { projectId: 13, groupName: "Group Gamma", total: 5, done: 5, overdue: 0, milestones: [] },
    ],
  };

  it("shows X of Y done, overdue with an icon, milestone mini-bars, three buttons and the planning-only note", async () => {
    signInAs(50, "INSTRUCTOR");
    serve({ "GET /api/assignments/3/task-summary": () => ({ status: 200, body: SUMMARY }) });
    wrap(<GroupTaskCards assignmentId={3} />);

    expect(await screen.findByRole("heading", { name: "Task progress" })).toBeInTheDocument();
    expect(screen.getByText("Planning only. Not part of the contribution score.")).toBeInTheDocument();

    const alpha = screen.getByRole("article", { name: "Group Alpha task progress" });
    expect(within(alpha).getByText("3 of 8 tasks done")).toBeInTheDocument();
    const overdue = within(alpha).getByText("2 overdue");
    expect(overdue.parentElement?.querySelector("svg")).not.toBeNull();
    expect(within(alpha).getByRole("progressbar", { name: "Group Alpha tasks done" })).toHaveAttribute("aria-valuenow", "38");
    expect(within(alpha).getByRole("progressbar", { name: "Alpha release progress" })).toHaveAttribute("aria-valuenow", "25");
    expect(within(alpha).getByText(/1 of 4 · due Nov 20/)).toBeInTheDocument();
    expect(within(alpha).getAllByRole("button").map((b) => b.textContent)).toEqual(["Open tasks", "Workload", "Open report"]);

    const beta = screen.getByRole("article", { name: "Group Beta task progress" });
    expect(within(beta).getByText("No tasks yet.")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Group Gamma task progress" })).getByText("None overdue")).toBeInTheDocument();
  });

  it("the three buttons go to the group's tasks, its workload and its report", async () => {
    signInAs(50, "INSTRUCTOR");
    serve({ "GET /api/assignments/3/task-summary": () => ({ status: 200, body: SUMMARY }) });
    wrap(<GroupTaskCards assignmentId={3} />);
    const alpha = await screen.findByRole("article", { name: "Group Alpha task progress" });
    const user = userEvent.setup();
    await user.click(within(alpha).getByRole("button", { name: "Open tasks" }));
    await user.click(within(alpha).getByRole("button", { name: "Workload" }));
    await user.click(within(alpha).getByRole("button", { name: "Open report" }));
    expect(navigate.mock.calls.map((c) => c[0])).toEqual(["/project/11?tab=tasks", "/project/11?tab=tasks&workload=1", "/project/11"]);
  });

  it("renders nothing for an assignment with no groups, and a quiet message if the summary cannot load", async () => {
    signInAs(50, "INSTRUCTOR");
    serve({ "GET /api/assignments/3/task-summary": () => ({ status: 200, body: { assignmentId: 3, groups: [] } }) });
    const first = wrap(<GroupTaskCards assignmentId={3} />);
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Task progress" })).not.toBeInTheDocument());
    first.unmount();

    serve({ "GET /api/assignments/3/task-summary": () => ({ status: 500, body: { error: "boom" } }) });
    wrap(<GroupTaskCards assignmentId={3} />);
    expect(await screen.findByText("Task progress could not be loaded.")).toBeInTheDocument();
  });
});
