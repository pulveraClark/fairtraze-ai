import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentProps } from "react";
import type { BoardResponse, BoardTask, BulkSkipped } from "@shared/taskTypes";
import * as AuthContextModule from "../../context/AuthContext";
import { ToastProvider } from "../Toast";
import { TasksTab } from "./TasksTab";
import { addDays, todayManila } from "../../lib/tasks/dates";
import { LEADER_PERMS, mkBoard, mkGroup, mkTask, NO_PERMS, resetFixtureIds } from "../../../test/taskFixtures";

// Capture the props TasksTab's views give DndContext, so a calendar drop can be driven directly
// (jsdom has no layout for the real pointer sensor).
const captured: { props: ComponentProps<typeof import("@dnd-kit/core").DndContext> | null } = { props: null };
vi.mock("@dnd-kit/core", async () => {
  const actual = await vi.importActual<typeof import("@dnd-kit/core")>("@dnd-kit/core");
  return {
    ...actual,
    DndContext: (props: ComponentProps<typeof actual.DndContext>) => {
      captured.props = props;
      return createElement(actual.DndContext, props);
    },
  };
});

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

/** An in-memory stand-in for the Tasks API: board, PATCH and bulk. */
function installFakeServer(initial: BoardResponse, opts: { skip?: BulkSkipped[] } = {}) {
  const state = { board: structuredClone(initial), calls: [] as Call[] };
  const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data });

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    state.calls.push({ method, url, body });

    if (method === "GET" && url === "/api/groups/7/tasks") return reply(200, state.board);

    if (method === "POST" && url === "/api/groups/7/tasks/bulk") {
      const ids = body!.taskIds as number[];
      const action = body!.action as Record<string, unknown>;
      const skipped = opts.skip ?? [];
      const skippedIds = new Set(skipped.map((s) => s.taskId));
      state.board = {
        ...state.board,
        tasks: state.board.tasks.map((t) => {
          if (!ids.includes(t.id) || skippedIds.has(t.id)) return t;
          const next = { ...t, version: t.version + 1 };
          if (action.type === "status") { next.status = action.status as BoardTask["status"]; next.done = next.status === "DONE"; }
          if (action.type === "priority") next.priority = action.priority as BoardTask["priority"];
          if (action.type === "assign") next.assignedToUserId = action.userId as number | null;
          return next;
        }),
      };
      return reply(200, { tasks: state.board.tasks.filter((t) => ids.includes(t.id)), skipped });
    }

    const patch = url.match(/\/tasks\/(\d+)$/);
    if (method === "PATCH" && patch) {
      const id = Number(patch[1]);
      const { expectedVersion: _v, ...fields } = body!;
      const current = state.board.tasks.find((t) => t.id === id)!;
      const saved = { ...current, ...fields, version: current.version + 1 } as BoardTask;
      state.board = { ...state.board, tasks: state.board.tasks.map((t) => (t.id === id ? saved : t)) };
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

const MEMBER_VIEWER = { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false };
const READONLY_VIEWER = { userId: 50, isLeader: false, isMember: false, readOnly: true, canCreate: false, canManageBoard: false };

beforeEach(() => {
  resetFixtureIds();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("view switch", () => {
  const tasks = () => [mkTask({ id: 1, title: "Alpha task" }), mkTask({ id: 2, title: "Beta task" })];

  it("starts on the Board, switches views, remembers the choice and keeps ?view= in the URL", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, tasks()));
    const first = renderTab();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Task board" });
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("radio", { name: "List" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(window.location.search).toBe("?view=list");

    await user.click(screen.getByRole("radio", { name: "Calendar" }));
    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(window.location.search).toBe("?view=calendar");

    await user.click(screen.getByRole("radio", { name: "Board" }));
    expect(window.location.search).toBe("");

    // Remembered per user: a fresh mount without ?view= comes back on the last view.
    await user.click(screen.getByRole("radio", { name: "List" }));
    first.unmount();
    window.history.replaceState(null, "", "/");
    renderTab();
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("?view= wins over the remembered view, and blocked storage does not break anything", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, tasks()));
    window.localStorage.setItem("ft.tasks.view.1", "list");
    window.history.replaceState(null, "", "/?tab=tasks&view=calendar");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    renderTab();
    expect(await screen.findByRole("grid")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("radio", { name: "List" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(window.location.search).toBe("?tab=tasks&view=list"); // ?tab= is left alone
  });

  it("arrow keys move between the views", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, tasks()));
    renderTab();
    const user = userEvent.setup();
    await screen.findByRole("region", { name: "Task board" });
    screen.getByRole("radio", { name: "Board" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "List" })).toHaveFocus();
  });
});

describe("list view", () => {
  const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => within(r).getByRole("button", { name: /./ , hidden: false }).textContent);
  const setup = async (extra: Partial<BoardResponse> = {}, tasks?: BoardTask[]) => {
    signInAs(1);
    window.history.replaceState(null, "", "/?view=list");
    installFakeServer(mkBoard(extra, tasks ?? [
      mkTask({ id: 1, number: 1, title: "Charlie", priority: "LOW", assignedToUserId: 2, dueDate: addDays(todayManila(), 5) }),
      mkTask({ id: 2, number: 2, title: "Alpha", priority: "HIGH", assignedToUserId: 3, dueDate: addDays(todayManila(), -2) }),
      mkTask({ id: 3, number: 3, title: "Bravo", priority: "MEDIUM", status: "DONE", dueDate: addDays(todayManila(), -2) }),
    ]));
    renderTab();
    await screen.findByRole("table");
    return userEvent.setup();
  };

  it("shows every column and sorts when a header is clicked (aria-sort)", async () => {
    const user = await setup();
    for (const name of ["Key", "Title", "Assignee", "Status", "Priority", "Due", "Milestone", "Labels"]) {
      expect(screen.getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("columnheader", { name: "Key" })).toHaveAttribute("aria-sort", "ascending");
    expect(rows()).toEqual(["Charlie", "Alpha", "Bravo"]);

    await user.click(within(screen.getByRole("columnheader", { name: "Title" })).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: "Title" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Key" })).toHaveAttribute("aria-sort", "none");
    expect(rows()).toEqual(["Alpha", "Bravo", "Charlie"]);

    await user.click(within(screen.getByRole("columnheader", { name: "Title" })).getByRole("button"));
    expect(screen.getByRole("columnheader", { name: "Title" })).toHaveAttribute("aria-sort", "descending");
    expect(rows()).toEqual(["Charlie", "Bravo", "Alpha"]);

    await user.click(within(screen.getByRole("columnheader", { name: "Priority" })).getByRole("button"));
    expect(rows()).toEqual(["Alpha", "Bravo", "Charlie"]); // High, Medium, Low
  });

  it("overdue is red text with an icon and the word; a done task is not overdue", async () => {
    await setup();
    const alpha = screen.getByTestId("task-row-2");
    const overdue = within(alpha).getByText(/^Overdue · /);
    expect(overdue.className).toMatch(/text-red-800/);
    expect(overdue.querySelector("svg")).not.toBeNull();
    expect(within(screen.getByTestId("task-row-3")).queryByText(/Overdue/)).not.toBeInTheDocument();
  });

  it("uses the same filters as the board, including the member filter", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: /^Filter/ }));
    await user.click(screen.getByRole("checkbox", { name: "Ben Cruz" }));
    expect(rows()).toEqual(["Charlie"]);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.type(screen.getByRole("textbox", { name: "Search tasks" }), "brav");
    expect(rows()).toEqual(["Bravo"]);
  });

  it("scrolls inside its own box so the page never scrolls sideways", async () => {
    await setup();
    const box = screen.getByRole("region", { name: "Task list" });
    expect(box.className).toMatch(/overflow-x-auto/);
    expect(box.contains(screen.getByRole("table"))).toBe(true);
  });

  it("members and instructors get no tick boxes", async () => {
    signInAs(2);
    window.history.replaceState(null, "", "/?view=list");
    installFakeServer(mkBoard({ viewer: MEMBER_VIEWER }, [mkTask({ id: 1, title: "Mine", permissions: NO_PERMS })]));
    renderTab();
    await screen.findByRole("table");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("bulk edit", () => {
  const setup = async (opts: { skip?: BulkSkipped[] } = {}) => {
    signInAs(1);
    window.history.replaceState(null, "", "/?view=list");
    const server = installFakeServer(mkBoard({}, [
      mkTask({ id: 1, number: 1, title: "One" }),
      mkTask({ id: 2, number: 2, title: "Two" }),
      mkTask({ id: 3, number: 3, title: "Three" }),
    ]), opts);
    renderTab();
    await screen.findByRole("table");
    const user = userEvent.setup();
    return { server, user };
  };
  const bulkCalls = (s: { calls: Call[] }) => s.calls.filter((c) => c.url.endsWith("/tasks/bulk"));

  it("select all and per-row boxes drive the 'N selected' bar; Clear selection hides it", async () => {
    const { user } = await setup();
    expect(screen.queryByRole("region", { name: "Bulk edit" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select FT-1" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select all 3 tasks" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "Bulk edit" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select FT-1" })).not.toBeChecked();
  });

  it("priority applies at once, with no confirmation, and reports in a toast", async () => {
    const { server, user } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    await user.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    expect(await screen.findByText("Set High priority on 3 tasks")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bulkCalls(server)[0]!.body).toEqual({ taskIds: [1, 2, 3], action: { type: "priority", priority: "HIGH" } });
    expect(screen.queryByRole("region", { name: "Bulk edit" })).not.toBeInTheDocument();
  });

  it("Move to Done asks first; Esc cancels without calling the server", async () => {
    const { server, user } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "Select FT-1" }));
    await user.click(screen.getByRole("checkbox", { name: "Select FT-2" }));
    await user.click(screen.getByRole("button", { name: "Move to Done" }));

    const dialog = screen.getByRole("dialog", { name: "Move 2 tasks to Done?" });
    expect(within(dialog).getByRole("button", { name: "Confirm" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(bulkCalls(server)).toHaveLength(0);
    expect(screen.getByText("2 selected")).toBeInTheDocument(); // the selection is kept

    await user.click(screen.getByRole("button", { name: "Move to Done" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(bulkCalls(server)).toHaveLength(0);
  });

  it("Confirm moves the tasks, shows the result toast and the rows update", async () => {
    const { server, user } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    await user.click(screen.getByRole("button", { name: "Move to Done" }));
    expect(screen.getByRole("dialog", { name: "Move 3 tasks to Done?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Moved 3 tasks to Done")).toBeInTheDocument();
    expect(bulkCalls(server)[0]!.body).toEqual({ taskIds: [1, 2, 3], action: { type: "status", status: "DONE" } });
    await waitFor(() => expect(within(screen.getByTestId("task-row-1")).getByText("Done")).toBeInTheDocument());
  });

  it("Assign asks first, naming the person; Unassigned wording too", async () => {
    const { server, user } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    await user.selectOptions(screen.getByLabelText("Assign"), "2");
    expect(screen.getByRole("dialog", { name: "Assign 3 tasks to Ben Cruz?" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(bulkCalls(server)).toHaveLength(0);

    await user.selectOptions(screen.getByLabelText("Assign"), "none");
    expect(screen.getByRole("dialog", { name: "Unassign 3 tasks?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Unassigned 3 tasks")).toBeInTheDocument();
    expect(bulkCalls(server)[0]!.body).toEqual({ taskIds: [1, 2, 3], action: { type: "assign", userId: null } });
  });

  it("lists the tasks the server skipped, and leaves only those ticked", async () => {
    const skip = [{ taskId: 2, key: "FT-2", reason: "A task can have at most 5 labels." }];
    const { user } = await setup({ skip });
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    await user.selectOptions(screen.getByLabelText("Priority"), "LOW");

    expect(await screen.findByText("Set Low priority on 2 of 3 tasks. 1 skipped.")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Some tasks were skipped" });
    expect(within(dialog).getByText("FT-2")).toBeInTheDocument();
    expect(within(dialog).getByText(/at most 5 labels/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select FT-2" })).toBeChecked();
  });

  it("a ticked task that a filter hides is not edited", async () => {
    const { server, user } = await setup();
    await user.click(screen.getByRole("checkbox", { name: "Select all 3 tasks" }));
    await user.type(screen.getByRole("textbox", { name: "Search tasks" }), "two");
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Priority"), "HIGH");
    expect(bulkCalls(server)[0]!.body).toMatchObject({ taskIds: [2] });
  });
});

describe("calendar view", () => {
  // Wed 11 Nov 2026, 10:00 in Manila. Only Date is faked, so timers and user events run normally.
  const NOW = new Date("2026-11-11T02:00:00.000Z");
  const setup = async (tasks: BoardTask[], extra: Partial<BoardResponse> = {}) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    signInAs(1);
    window.history.replaceState(null, "", "/?view=calendar");
    const server = installFakeServer(mkBoard(extra, tasks));
    renderTab();
    await screen.findByRole("grid");
    return { server, user: userEvent.setup() };
  };
  const cell = (date: string) => document.querySelector(`[data-date="${date}"]`) as HTMLElement;

  it("shows the month, highlights today, marks the project deadline and milestone stars, and has a legend", async () => {
    await setup([mkTask({ id: 1, title: "Poster", dueDate: "2026-11-20" })], {
      group: mkGroup({ groupName: "G", deadline: "2026-11-25T10:00:00.000Z" }),
      milestones: [{ id: 5, name: "Alpha release", dueDate: "2026-11-18", position: 1, total: 0, done: 0 }],
    });
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    expect(cell("2026-11-11")).toHaveAccessibleName(/today/);
    expect(within(cell("2026-11-25")).getByText("Deadline")).toBeInTheDocument();
    expect(cell("2026-11-25")).toHaveAccessibleName(/project deadline/);
    expect(within(cell("2026-11-18")).getByText("Alpha release")).toBeInTheDocument();
    expect(cell("2026-11-18")).toHaveAccessibleName(/milestone Alpha release due/);
    expect(within(cell("2026-11-20")).getByRole("button", { name: /FT-1 Poster, due/ })).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Legend" });
    for (const word of ["Due", "Overdue", "Milestone due", "Done"]) expect(within(legend).getByText(word)).toBeInTheDocument();
    // Sunday-first columns.
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("puts a deadline stored at 16:00 UTC on the next Manila day (no off-by-one)", async () => {
    await setup([], { group: mkGroup({ groupName: "G", deadline: "2026-11-24T16:00:00.000Z" }) });
    expect(within(cell("2026-11-25")).getByText("Deadline")).toBeInTheDocument();
    expect(within(cell("2026-11-24")).queryByText("Deadline")).not.toBeInTheDocument();
  });

  it("marks overdue and done tasks with an icon and text, not colour alone", async () => {
    await setup([
      mkTask({ id: 1, title: "Late", dueDate: "2026-11-05" }),
      mkTask({ id: 2, title: "Finished", status: "DONE", dueDate: "2026-11-05" }),
    ]);
    expect(within(cell("2026-11-05")).getByRole("button", { name: /Late, overdue/ })).toBeInTheDocument();
    expect(within(cell("2026-11-05")).getByRole("button", { name: /Finished, done/ })).toBeInTheDocument();
  });

  it("previous, next and Today change the month", async () => {
    const { user } = await setup([]);
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
  });

  it("roving tabindex: one tab stop, arrows move between days, Enter opens a task", async () => {
    const { user } = await setup([mkTask({ id: 1, title: "Poster", dueDate: "2026-11-12" })]);
    const tabStops = () => Array.from(document.querySelectorAll('[role="gridcell"]')).filter((c) => c.getAttribute("tabindex") === "0");
    expect(tabStops()).toHaveLength(1);
    expect(tabStops()[0]).toBe(cell("2026-11-11"));

    cell("2026-11-11").focus();
    await user.keyboard("{ArrowRight}");
    expect(cell("2026-11-12")).toHaveFocus();
    expect(tabStops()).toEqual([cell("2026-11-12")]);
    await user.keyboard("{ArrowDown}");
    expect(cell("2026-11-19")).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowUp}");
    expect(cell("2026-11-11")).toHaveFocus();

    await user.keyboard("{ArrowRight}{Enter}");
    const panel = await screen.findByRole("dialog", { name: "FT-1" });
    expect(within(panel).getByLabelText("Title")).toHaveValue("Poster");
  });

  it("arrows cross into the next month", async () => {
    const { user } = await setup([]);
    // The November grid runs to Sat 12 Dec; one more step leaves it and the calendar follows.
    cell("2026-11-30").focus();
    await user.keyboard("{ArrowRight}");
    expect(cell("2026-12-01")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    cell("2026-12-12").focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument());
    expect(cell("2026-12-13")).toHaveFocus();
  });

  it("dropping a task on another day changes only its due date, and Undo restores it", async () => {
    const { server, user } = await setup([mkTask({ id: 1, number: 1, title: "Poster", dueDate: "2026-11-20", version: 3 })]);
    act(() => captured.props!.onDragEnd!({ active: { id: "task:1" }, over: { id: "day:2026-11-25" } } as never));

    expect(await screen.findByText("Due date for FT-1 set to Nov 25.")).toBeInTheDocument();
    const patch = server.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/groups/7/tasks/1");
    expect(patch.body).toEqual({ dueDate: "2026-11-25", expectedVersion: 3 });
    await waitFor(() => expect(within(cell("2026-11-25")).getByRole("button", { name: /Poster/ })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Due date restored.")).toBeInTheDocument();
    const patches = server.calls.filter((c) => c.method === "PATCH");
    expect(patches[1]!.body).toEqual({ dueDate: "2026-11-20", expectedVersion: 4 });
    await waitFor(() => expect(within(cell("2026-11-20")).getByRole("button", { name: /Poster/ })).toBeInTheDocument());
  });

  it("dropping on the same day sends nothing", async () => {
    const { server } = await setup([mkTask({ id: 1, title: "Poster", dueDate: "2026-11-20" })]);
    act(() => captured.props!.onDragEnd!({ active: { id: "task:1" }, over: { id: "day:2026-11-20" } } as never));
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("a task the viewer cannot reschedule has no drag affordance", async () => {
    signInAs(2);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    window.history.replaceState(null, "", "/?view=calendar");
    installFakeServer(mkBoard({ viewer: MEMBER_VIEWER }, [mkTask({ id: 1, title: "Not mine", dueDate: "2026-11-20", permissions: NO_PERMS })]));
    renderTab();
    const chip = await screen.findByRole("button", { name: /Not mine/ });
    expect(chip.getAttribute("aria-label")).not.toMatch(/Drag to another day/);
  });

  it("scrolls inside its own box", async () => {
    await setup([]);
    expect(screen.getByRole("region", { name: "Task calendar" }).className).toMatch(/overflow-x-auto/);
  });
});

describe("keyboard shortcuts", () => {
  const setup = async (viewer?: BoardResponse["viewer"]) => {
    signInAs(viewer?.userId ?? 1);
    installFakeServer(mkBoard(viewer ? { viewer } : {}, [
      mkTask({ id: 1, number: 1, title: "First task" }),
      mkTask({ id: 2, number: 2, title: "Second task" }),
      mkTask({ id: 3, number: 3, title: "Third task", status: "IN_PROGRESS" }),
    ]));
    renderTab();
    await screen.findByText("First task");
    return userEvent.setup();
  };

  it("shows the footer hint on the board", async () => {
    await setup();
    expect(screen.getByRole("button", { name: "About keyboard shortcuts" })).toBeInTheDocument();
  });

  it("C opens New task; / focuses search; ? opens the shortcuts dialog and Esc closes it", async () => {
    const user = await setup();
    await user.keyboard("c");
    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("/");
    expect(screen.getByRole("textbox", { name: "Search tasks" })).toHaveFocus();
    await user.keyboard("{Escape}");
    screen.getByRole("textbox", { name: "Search tasks" }).blur();

    await user.keyboard("?");
    const help = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(help).getByText("Create a task")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("the shortcuts dialog keeps Tab inside and returns focus on close", async () => {
    const user = await setup();
    await user.click(screen.getByRole("button", { name: "About keyboard shortcuts" }));
    const hint = screen.getByRole("button", { name: "Show shortcuts" });
    hint.focus();
    await user.click(hint);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(hint).toHaveFocus();
  });

  it("never fires while typing in a field, or with Ctrl, Cmd or Alt held", async () => {
    const user = await setup();
    await user.click(screen.getByRole("textbox", { name: "Search tasks" }));
    await user.keyboard("c?/jk");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search tasks" })).toHaveValue("c?/jk");

    screen.getByRole("textbox", { name: "Search tasks" }).blur();
    await user.keyboard("{Control>}c{/Control}{Meta>}c{/Meta}{Alt>}c{/Alt}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never fires inside a contenteditable", async () => {
    await setup();
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.tabIndex = 0;
    document.body.appendChild(editable);
    editable.focus();
    await userEvent.setup().keyboard("c");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    editable.remove();
  });

  it("does nothing while a dialog is open (no second dialog on top)", async () => {
    const user = await setup();
    await user.keyboard("?");
    await user.keyboard("c");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("J and K move focus between tasks in board order; Enter opens the one you are on", async () => {
    const user = await setup();
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /First task/ })).toHaveFocus();
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Second task/ })).toHaveFocus();
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Third task/ })).toHaveFocus(); // next column
    await user.keyboard("j");
    expect(screen.getByRole("button", { name: /Third task/ })).toHaveFocus(); // stops at the end
    await user.keyboard("k");
    expect(screen.getByRole("button", { name: /Second task/ })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("works in the list view too, in the sorted order", async () => {
    signInAs(1);
    window.history.replaceState(null, "", "/?view=list");
    installFakeServer(mkBoard({}, [mkTask({ id: 1, number: 1, title: "Zed" }), mkTask({ id: 2, number: 2, title: "Abe" })]));
    renderTab();
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.click(within(screen.getByRole("columnheader", { name: "Title" })).getByRole("button"));
    document.body.focus();
    await user.keyboard("j");
    expect(within(screen.getByTestId("task-row-2")).getByRole("button")).toHaveFocus();
  });

  it("Esc clears a bulk selection when nothing else is open", async () => {
    signInAs(1);
    window.history.replaceState(null, "", "/?view=list");
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "A" })]));
    renderTab();
    const user = userEvent.setup();
    await screen.findByRole("table");
    await user.click(screen.getByRole("checkbox", { name: "Select FT-1" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });

  it("C does nothing for a read-only viewer, and the dialog omits it", async () => {
    const user = await setup(READONLY_VIEWER);
    await user.keyboard("c");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("?");
    expect(within(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).queryByText("Create a task")).not.toBeInTheDocument();
  });
});
