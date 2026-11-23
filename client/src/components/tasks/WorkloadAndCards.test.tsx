import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse, WorkloadResponse } from "@shared/taskTypes";
import * as AuthContextModule from "../../context/AuthContext";
import * as RouterModule from "../../router";
import { ToastProvider } from "../Toast";
import { TasksTab } from "./TasksTab";
import { WorkloadPanel } from "./WorkloadPanel";
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
