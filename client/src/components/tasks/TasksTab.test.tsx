import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import * as AuthContextModule from "../../context/AuthContext";
import { ToastProvider } from "../Toast";
import { TasksTab } from "./TasksTab";
import { addDays, todayManila } from "../../lib/tasks/dates";
import { applyMove } from "../../lib/tasks/board";
import {
  ASSIGNEE_PERMS, BEN, LEADER, LEADER_PERMS, mkBoard, mkTask, NO_PERMS, resetFixtureIds,
} from "../../../test/taskFixtures";

vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function signInAs(id: number, systemRole: "STUDENT" | "INSTRUCTOR" | "ADMIN" = "STUDENT") {
  mockUseAuth.mockReturnValue({
    user: { id, email: "a@example.com", name: "Someone", systemRole },
    token: "t", loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
}

interface Call { method: string; url: string; body?: Record<string, unknown> }

/** A tiny in-memory stand-in for the Tasks API. */
function installFakeServer(initial: BoardResponse) {
  const state = { board: structuredClone(initial), calls: [] as Call[], conflictOnNextMove: false };
  const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data });

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    state.calls.push({ method, url, body });

    if (method === "GET" && url === "/api/groups/7/tasks") return reply(200, state.board);

    const move = url.match(/\/tasks\/(\d+)\/move$/);
    if (method === "POST" && move) {
      const id = Number(move[1]);
      const current = state.board.tasks.find((t) => t.id === id)!;
      if (state.conflictOnNextMove) {
        state.conflictOnNextMove = false;
        const changed = { ...current, title: "Changed by someone else", version: current.version + 1 };
        state.board.tasks = state.board.tasks.map((t) => (t.id === id ? changed : t));
        return reply(409, { error: "This task was changed by someone else.", code: "VERSION_CONFLICT", task: changed });
      }
      const next = applyMove(state.board, id, { status: body!.status as BoardTask["status"], afterId: (body!.afterId as number | null) ?? null, beforeId: (body!.beforeId as number | null) ?? null });
      const saved = { ...next.tasks.find((t) => t.id === id)!, version: current.version + 1 };
      state.board = { ...next, tasks: next.tasks.map((t) => (t.id === id ? saved : t)) };
      return reply(200, saved);
    }

    if (method === "POST" && url === "/api/groups/7/tasks") {
      const number = state.board.tasks.length + 1;
      const created = mkTask({ id: 100 + number, number, key: `FT-${number}`, title: String(body!.title), status: "TODO", permissions: LEADER_PERMS });
      state.board = { ...state.board, tasks: [...state.board.tasks, created] };
      return reply(201, created);
    }
    return reply(404, { error: `unhandled ${method} ${url}` });
  }));
  return state;
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><TasksTab projectId={7} /></ToastProvider>
    </QueryClientProvider>,
  );
}

const column = (name: string) => screen.getByRole("region", { name: "Task board" }).querySelector(`section[aria-labelledby="col-title-${name}"]`) as HTMLElement;

beforeEach(() => { resetFixtureIds(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("board layout", () => {
  it("shows the four columns with counts and the card details", async () => {
    signInAs(1);
    const today = todayManila();
    installFakeServer(mkBoard({
      milestones: [{ id: 5, name: "Alpha release", dueDate: addDays(today, 30), position: 1, total: 1, done: 0 }],
      labels: [{ id: 10, name: "frontend", color: "blue" }],
    }, [
      mkTask({ id: 1, title: "Design poster", assignedToUserId: 2, priority: "HIGH", labelIds: [10], milestoneId: 5, dueDate: addDays(today, 3), subtasks: { done: 2, total: 4 }, commitCount: 3 }),
      mkTask({ id: 2, title: "Write report", status: "IN_PROGRESS" }),
      mkTask({ id: 3, title: "Old chore", status: "DONE" }),
    ]));
    renderTab();

    await screen.findByText("Design poster");
    for (const [name, count] of [["TODO", 1], ["IN_PROGRESS", 1], ["IN_REVIEW", 0], ["DONE", 1]] as const) {
      expect(within(column(name)).getByLabelText(`${count} ${count === 1 ? "task" : "tasks"}`)).toBeInTheDocument();
    }
    const card = screen.getByTestId("task-card-1");
    expect(within(card).getByText("FT-1")).toBeInTheDocument();
    expect(within(card).getByText("frontend")).toBeInTheDocument();
    expect(within(card).getByText("Alpha release")).toBeInTheDocument();
    expect(within(card).getByText("High")).toBeInTheDocument();
    expect(within(card).getByText("2 of 4")).toBeInTheDocument();
    expect(within(card).getByText("3 commits")).toBeInTheDocument();
    expect(within(card).getByText("Assigned to Ben Cruz")).toBeInTheDocument();
    expect(screen.getByText("Tasks help your group plan. They don't change contribution scores.")).toBeInTheDocument();
  });

  it("marks an overdue task with text and an icon, never color alone", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Late one", dueDate: addDays(todayManila(), -3) }), mkTask({ id: 2, title: "Late but done", status: "DONE", dueDate: addDays(todayManila(), -3) })]));
    renderTab();
    await screen.findByText("Late one");
    expect(within(screen.getByTestId("task-card-1")).getByText(/^Overdue · /)).toBeInTheDocument();
    expect(within(screen.getByTestId("task-card-2")).queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it("shows a milestone due after the project deadline in red text with a note", async () => {
    signInAs(1);
    const deadline = new Date(`${addDays(todayManila(), 10)}T10:00:00Z`).toISOString();
    installFakeServer(mkBoard({
      group: { id: 7, groupName: "G", taskKey: "FT", deadline },
      milestones: [
        { id: 5, name: "Too late", dueDate: addDays(todayManila(), 20), position: 1, total: 2, done: 1 },
        { id: 6, name: "On time", dueDate: addDays(todayManila(), 5), position: 2, total: 0, done: 0 },
      ],
    }, []));
    renderTab();
    const late = (await screen.findByRole("button", { name: /Too late/ }));
    expect(within(late).getByText("1 of 2")).toBeInTheDocument();
    expect(within(late).getByText("Due after the project deadline")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /On time/ })).queryByText("Due after the project deadline")).not.toBeInTheDocument();
  });
});

describe("permissions mirrored in the UI", () => {
  const tasks = () => [
    mkTask({ id: 1, title: "Mine", assignedToUserId: 2, permissions: ASSIGNEE_PERMS }),
    mkTask({ id: 2, title: "Someone else's", assignedToUserId: 3, permissions: NO_PERMS }),
    mkTask({ id: 3, title: "Unassigned", permissions: NO_PERMS }),
  ];

  it("leader: a grip on every card, quick add in every column", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, tasks().map((t) => ({ ...t, permissions: LEADER_PERMS }))));
    renderTab();
    await screen.findByText("Mine");
    expect(screen.getAllByRole("button", { name: /^Move FT-/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Add task/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "New task" })).toBeInTheDocument();
  });

  it("member: a grip only on their own card; locked cards explain who can move them", async () => {
    signInAs(2);
    installFakeServer(mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, tasks()));
    renderTab();
    await screen.findByText("Mine");
    expect(screen.getAllByRole("button", { name: /^Move FT-/ })).toHaveLength(1);
    expect(within(screen.getByTestId("task-card-1")).getByRole("button", { name: /^Move FT-1/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Only Ana Reyes or the group leader can move this task." })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Only the group leader can move this task." })).toBeInTheDocument();
    // A member can create, but only into To do.
    expect(screen.getAllByRole("button", { name: /^Add task/ })).toHaveLength(1);
    expect(within(column("TODO")).getByRole("button", { name: /^Add task/ })).toBeInTheDocument();
  });

  it("instructor/admin: read-only, no grips, no locks, no creating", async () => {
    signInAs(50, "INSTRUCTOR");
    installFakeServer(mkBoard({ viewer: { userId: 50, isLeader: false, isMember: false, readOnly: true, canCreate: false, canManageBoard: false } }, tasks().map((t) => ({ ...t, permissions: NO_PERMS }))));
    renderTab();
    await screen.findByText("Mine");
    expect(screen.queryByRole("button", { name: /^Move FT-/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /can move this task/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Add task/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My tasks" })).not.toBeInTheDocument();
    expect(screen.getByText(/View only/)).toBeInTheDocument();
  });

  it("status menu: Done is disabled and labelled 'leader only' for an assignee", async () => {
    signInAs(2);
    installFakeServer(mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, [
      mkTask({ id: 1, title: "Mine", assignedToUserId: 2, permissions: ASSIGNEE_PERMS }),
    ]));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Mine/ }));
    const done = screen.getByRole("option", { name: "Done (leader only)" }) as HTMLOptionElement;
    expect(done.disabled).toBe(true);
    expect((screen.getByRole("option", { name: "In review" }) as HTMLOptionElement).disabled).toBe(false);
    // Fields the assignee cannot change are plain text.
    expect(screen.queryByLabelText("Assignee", { selector: "select" })).not.toBeInTheDocument();
  });
});

describe("filters", () => {
  const setup = async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [
      mkTask({ id: 1, title: "Alpha task", assignedToUserId: 2 }),
      mkTask({ id: 2, title: "Beta task", assignedToUserId: 3 }),
      mkTask({ id: 3, title: "Mine task", assignedToUserId: 1 }),
      mkTask({ id: 4, title: "Gamma task" }),
    ]));
    renderTab();
    await screen.findByText("Alpha task");
    return userEvent.setup();
  };

  it("member avatars filter, show the status line and the full name, and Clear resets", async () => {
    const user = await setup();
    const ben = screen.getByRole("button", { name: "Ben Cruz" });
    expect(ben).toHaveAttribute("title", "Ben Cruz");
    expect(ben).toHaveAttribute("aria-pressed", "false");
    await user.click(ben);
    expect(ben).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/^Showing /)).toHaveTextContent("Showing tasks for Ben Cruz · 1 of 4 tasks");
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ana Reyes" }));
    expect(screen.getByText(/^Showing /)).toHaveTextContent("Showing tasks for Ben Cruz, Ana Reyes · 2 of 4 tasks");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Gamma task")).toBeInTheDocument();
    expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
  });

  it("My tasks and search narrow the board", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "My tasks" }));
    expect(screen.getByText("Mine task")).toBeInTheDocument();
    expect(screen.queryByText("Alpha task")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "My tasks" }));

    await user.type(screen.getByRole("textbox", { name: "Search tasks" }), "gamma");
    expect(screen.getByText("Gamma task")).toBeInTheDocument();
    expect(screen.queryByText("Beta task")).not.toBeInTheDocument();
    expect(screen.getByText(/^Showing /)).toHaveTextContent("Showing 1 of 4 tasks");
  });

  it("the Filter menu filters by priority and shows a badge", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Urgent thing", priority: "HIGH" }), mkTask({ id: 2, title: "Easy thing", priority: "LOW" })]));
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("Urgent thing");
    await user.click(screen.getByRole("button", { name: /^Filter/ }));
    await user.click(screen.getByRole("checkbox", { name: "High" }));
    expect(screen.queryByText("Easy thing")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("1");
  });

  it("a milestone card filters the board and toggles off", async () => {
    signInAs(1);
    installFakeServer(mkBoard({ milestones: [{ id: 5, name: "Beta", dueDate: null, position: 1, total: 1, done: 0 }] }, [
      mkTask({ id: 1, title: "In beta", milestoneId: 5 }), mkTask({ id: 2, title: "Not in beta" }),
    ]));
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("In beta");
    const card = screen.getByRole("button", { name: /^Beta/ });
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Not in beta")).not.toBeInTheDocument();
    await user.click(card);
    expect(screen.getByText("Not in beta")).toBeInTheDocument();
  });
});

describe("creating tasks", () => {
  it("quick add creates a task in To do with just a title", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, []));
    renderTab();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Task board" });
    await user.click(within(column("TODO")).getByRole("button", { name: /^Add task/ }));
    await user.type(screen.getByLabelText(/New task title in To do/), "Book the room{Enter}");
    expect(await screen.findByText("Book the room")).toBeInTheDocument();
    expect(server.calls.find((c) => c.method === "POST" && c.url === "/api/groups/7/tasks")?.body).toEqual({ title: "Book the room" });
  });

  it("the leader's quick add in another column creates the task and moves it there", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, []));
    renderTab();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Task board" });
    await user.click(within(column("IN_REVIEW")).getByRole("button", { name: /^Add task/ }));
    await user.type(screen.getByLabelText(/New task title in In review/), "Needs a look{Enter}");
    await waitFor(() => expect(within(column("IN_REVIEW")).getByText("Needs a look")).toBeInTheDocument());
    expect(server.calls.some((c) => c.url.endsWith("/move") && c.body?.status === "IN_REVIEW")).toBe(true);
  });

  it("the New task dialog creates a task", async () => {
    signInAs(2);
    const server = installFakeServer(mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, []));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "New task" }));
    expect(screen.getByText(/start unassigned in To do/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "Draft the intro");
    await user.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByText("Draft the intro")).toBeInTheDocument();
    expect(server.calls.find((c) => c.method === "POST")?.body).toMatchObject({ title: "Draft the intro", priority: "MEDIUM" });
  });
});

describe("moving a task: optimistic, toast with Undo, conflicts", () => {
  const setup = async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, [
      mkTask({ id: 15, number: 15, title: "Wire the API", status: "TODO" }),
      mkTask({ id: 16, number: 16, title: "Second", status: "TODO" }),
    ]));
    renderTab();
    const user = userEvent.setup();
    await screen.findByText("Wire the API");
    await user.click(screen.getByRole("button", { name: /Wire the API/ }));
    return { server, user };
  };

  it("moves via the status menu, confirms in a toast, and Undo puts it back", async () => {
    const { server, user } = await setup();
    await user.selectOptions(screen.getByLabelText("Status"), "IN_PROGRESS");

    expect(await screen.findByText("Moved FT-15 to In progress. Saved to task history.")).toBeInTheDocument();
    expect(server.board.tasks.find((t) => t.id === 15)!.status).toBe("IN_PROGRESS");
    expect(within(column("IN_PROGRESS")).getByText("Wire the API")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Move undone.")).toBeInTheDocument();
    await waitFor(() => expect(server.board.tasks.find((t) => t.id === 15)!.status).toBe("TODO"));
    // The undo is a normal move with the fresh version, so nothing is overwritten.
    const moves = server.calls.filter((c) => c.url.endsWith("/move"));
    expect(moves).toHaveLength(2);
    expect(moves[0]!.body).toMatchObject({ status: "IN_PROGRESS", expectedVersion: 1 });
    expect(moves[1]!.body).toMatchObject({ status: "TODO", expectedVersion: 2 });
  });

  it("a 409 refreshes the card, says so, and does not move it", async () => {
    const { server, user } = await setup();
    server.conflictOnNextMove = true;
    await user.selectOptions(screen.getByLabelText("Status"), "IN_REVIEW");
    expect(await screen.findByText("Someone else changed this task. The latest version is shown.")).toBeInTheDocument();
    await waitFor(() => expect(within(column("TODO")).getByText("Changed by someone else")).toBeInTheDocument());
    expect(within(column("IN_REVIEW")).queryByText("Changed by someone else")).not.toBeInTheDocument();
  });
});
