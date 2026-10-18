import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse, BoardTask, TaskDetails } from "@shared/taskTypes";
import * as AuthContextModule from "../../../context/AuthContext";
import { ToastProvider } from "../../Toast";
import { TasksTab } from "../TasksTab";
import { addDays, todayManila } from "../../../lib/tasks/dates";
import {
  ASSIGNEE_PERMS, ANA, BEN, LEADER, mkBoard, mkGroup, mkTask, NO_PERMS, resetFixtureIds,
} from "../../../../test/taskFixtures";

vi.mock("../../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../../context/AuthContext");
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

const emptyDetails = (taskId: number): TaskDetails => ({
  taskId, subtasks: [], attachments: [], storage: { usedBytes: 1_258_291, limitBytes: 50 * 1024 * 1024 },
  comments: [], watchers: [], watching: false, activity: [], commits: [],
});

/** An in-memory stand-in for the Tasks and task-details API. */
function installFakeServer(initial: BoardResponse, details: Record<number, Partial<TaskDetails>> = {}) {
  const state = {
    board: structuredClone(initial),
    details: new Map<number, TaskDetails>(),
    calls: [] as Call[],
    headings: [{ level: 1 as const, text: "Introduction" }, { level: 2 as const, text: "Methods" }],
    nextId: 500,
  };
  const detailsOf = (id: number) => {
    if (!state.details.has(id)) state.details.set(id, { ...emptyDetails(id), ...details[id] });
    return state.details.get(id)!;
  };
  // Clone like a real network response, so React Query never sees an object mutated in place.
  const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => structuredClone(data) });

  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body && typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    state.calls.push({ method, url, body });

    if (method === "GET" && url === "/api/groups/7/tasks") return reply(200, state.board);
    if (method === "GET" && url === "/api/groups/7/document/headings") return reply(200, { headings: state.headings });

    const m = url.match(/^\/api\/groups\/7\/tasks\/(\d+)\/(details|subtasks|comments|watch)(?:\/(\d+))?$/);
    if (m) {
      const id = Number(m[1]);
      const d = detailsOf(id);
      const sub = Number(m[3]);
      if (m[2] === "details") return reply(200, d);
      if (m[2] === "subtasks" && method === "POST") {
        const created = { id: ++state.nextId, title: String(body!.title), done: false, position: d.subtasks.length + 1 };
        d.subtasks.push(created);
        syncProgress(id);
        return reply(201, created);
      }
      if (m[2] === "subtasks" && method === "PATCH") {
        const s = d.subtasks.find((x) => x.id === sub)!;
        s.done = Boolean(body!.done);
        syncProgress(id);
        return reply(200, s);
      }
      if (m[2] === "comments" && method === "POST") {
        const c = { id: ++state.nextId, authorId: 1, body: String(body!.body), createdAt: "2026-10-15T02:40:00.000Z", editedAt: null };
        d.comments.push(c);
        return reply(201, c);
      }
      if (m[2] === "watch") {
        d.watching = method === "PUT";
        d.watchers = d.watching ? [...new Set([...d.watchers, 1])] : d.watchers.filter((w) => w !== 1);
        return reply(200, d);
      }
    }

    const patch = url.match(/^\/api\/groups\/7\/tasks\/(\d+)$/);
    if (method === "PATCH" && patch) {
      const id = Number(patch[1]);
      const current = state.board.tasks.find((t) => t.id === id)!;
      const { expectedVersion: _ignored, ...changes } = (body ?? {}) as Record<string, unknown>;
      void _ignored;
      const saved = { ...current, ...changes, version: current.version + 1 } as BoardTask;
      state.board = { ...state.board, tasks: state.board.tasks.map((t) => (t.id === id ? saved : t)) };
      return reply(200, saved);
    }
    return reply(404, { error: `unhandled ${method} ${url}` });
  }));

  function syncProgress(id: number) {
    const d = detailsOf(id);
    state.board = {
      ...state.board,
      tasks: state.board.tasks.map((t) => (t.id === id ? { ...t, subtasks: { done: d.subtasks.filter((s) => s.done).length, total: d.subtasks.length } } : t)),
    };
  }
  return state;
}

function renderTab(extra: Partial<React.ComponentProps<typeof TasksTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><TasksTab projectId={7} {...extra} /></ToastProvider>
    </QueryClientProvider>,
  );
}

const dialog = () => screen.getByRole("dialog");

beforeEach(() => { resetFixtureIds(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const three = () => [
  mkTask({ id: 1, title: "First task" }),
  mkTask({ id: 2, title: "Second task" }),
  mkTask({ id: 3, title: "Third task" }),
];

describe("opening and closing", () => {
  it("opens a centered dialog named by the task key, with 'N of M', and returns focus to the card on Esc", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    const card = await screen.findByRole("button", { name: /First task/ });
    card.focus();
    await user.click(card);

    const d = await screen.findByRole("dialog", { name: "FT-1" });
    expect(d).toHaveAttribute("aria-modal", "true");
    expect(within(d).getByText("1 of 3")).toBeInTheDocument();
    expect(d.className).toContain("sm:max-w-[980px]");
    expect(d.parentElement?.className).toContain("fixed inset-0");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it("closes with the Close button, and keeps Tab inside the window", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await screen.findByRole("dialog", { name: "FT-1" });
    for (let i = 0; i < 80; i++) await user.tab();
    expect(dialog().contains(document.activeElement)).toBe(true);
    await user.click(screen.getByRole("button", { name: "Close task details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens straight from a ?task= link (initialTaskId)", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab({ initialTaskId: 2 });
    expect(await screen.findByRole("dialog", { name: "FT-2" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("opens from the list view and from the calendar chip", async () => {
    signInAs(1);
    const due = todayManila();
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Dated one", dueDate: due })]));
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: "List" }));
    await user.click(await screen.findByRole("button", { name: /Dated one/ }));
    expect(await screen.findByRole("dialog", { name: "FT-1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: "Calendar" }));
    const chip = (await screen.findAllByRole("button", { name: /Dated one/ }))[0]!;
    await user.click(chip);
    expect(await screen.findByRole("dialog", { name: "FT-1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });
});

describe("moving between tasks", () => {
  it("‹ › buttons and the J and K keys step through the current order without closing", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await screen.findByRole("dialog", { name: "FT-1" });

    expect(screen.getByRole("button", { name: "Previous task" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next task" }));
    expect(await screen.findByRole("dialog", { name: "FT-2" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    await user.keyboard("j");
    expect(await screen.findByRole("dialog", { name: "FT-3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next task" })).toBeDisabled();
    await user.keyboard("k");
    expect(await screen.findByRole("dialog", { name: "FT-2" })).toBeInTheDocument();
  });

  it("follows the current filters: 'N of M' counts only the tasks the filters show", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [
      mkTask({ id: 1, title: "Fix login" }),
      mkTask({ id: 2, title: "Write docs" }),
      mkTask({ id: 3, title: "Fix logout" }),
    ]));
    renderTab();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Search/i), "Fix");
    await user.click(await screen.findByRole("button", { name: /Fix login/ }));
    const d = await screen.findByRole("dialog", { name: "FT-1" });
    expect(within(d).getByText("1 of 2")).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Next task" }));
    expect(await screen.findByRole("dialog", { name: "FT-3" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next task" })).toBeDisabled();
  });

  it("typing J in a field does not move to another task", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await screen.findByRole("dialog", { name: "FT-1" });
    await user.click(await screen.findByLabelText("Add a comment"));
    await user.keyboard("jk");
    expect(screen.getByRole("dialog", { name: "FT-1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("jk");
  });
});

describe("subtasks", () => {
  it("adds and ticks subtasks; progress shows on the card", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await screen.findByRole("dialog", { name: "FT-1" });

    await user.type(await screen.findByLabelText("New subtask"), "Draft the intro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByLabelText("New subtask"), "Proofread");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Draft the intro")).toBeInTheDocument();
    await user.click(await screen.findByRole("checkbox", { name: "Draft the intro" }));

    await waitFor(() => expect(within(dialog()).getByText("1 of 2 done")).toBeInTheDocument());
    await waitFor(() => expect(within(screen.getByTestId("task-card-1")).getByText("1 of 2")).toBeInTheDocument());
  });

  it("is locked (with the reason) for a member who cannot edit the task", async () => {
    signInAs(2);
    installFakeServer(
      mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, [
        mkTask({ id: 1, title: "Not mine", assignedToUserId: 3, permissions: { ...NO_PERMS, comment: true, watch: true } }),
      ]),
      { 1: { subtasks: [{ id: 9, title: "Existing", done: false, position: 1 }] } },
    );
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Not mine/ }));
    const box = await screen.findByRole("checkbox", { name: "Existing" });
    expect(box).toBeDisabled();
    expect(screen.queryByLabelText("New subtask")).not.toBeInTheDocument();
    expect(screen.getAllByText("Only the assigned member or the group leader can change this.").length).toBeGreaterThan(0);
  });
});

describe("comments and @mentions", () => {
  it("offers only group members after @, and posts a <@userId> token", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    const box = await screen.findByLabelText("Add a comment");

    await user.type(box, "Please check @Be");
    const list = await screen.findByRole("listbox", { name: "Mention a group member" });
    expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Ben Cruz"]);
    await user.keyboard("{Enter}");
    expect(box).toHaveValue("Please check @Ben Cruz ");
    await user.type(box, "thanks");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() => expect(server.calls.some((c) => c.method === "POST" && c.url.endsWith("/comments"))).toBe(true));
    expect(server.calls.find((c) => c.url.endsWith("/comments"))?.body).toEqual({ body: `Please check <@${BEN.userId}> thanks` });
    // Rendered live from the member list.
    expect(await screen.findByText("@Ben Cruz")).toBeInTheDocument();
  });

  it("lists everyone with a bare @ and never suggests a non-member", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await user.type(await screen.findByLabelText("Add a comment"), "@");
    const names = within(await screen.findByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
    expect(names.sort()).toEqual([ANA.name, BEN.name, LEADER.name].sort());
    await user.type(screen.getByLabelText("Add a comment"), "zz");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Escape closes the @ list first and only the second press closes the window", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await user.type(await screen.findByLabelText("Add a comment"), "@");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "FT-1" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a former member's mention as plain 'a former member'", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()), {
      1: { comments: [{ id: 1, authorId: 3, body: "ping <@99> and <@2>", createdAt: "2026-10-15T02:40:00.000Z", editedAt: null }] },
    });
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    expect(await screen.findByText("a former member")).toBeInTheDocument();
    expect(screen.getByText("@Ben Cruz")).toBeInTheDocument();
  });

  it("lets you edit and delete only your own comments", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()), {
      1: {
        comments: [
          { id: 1, authorId: 1, body: "mine", createdAt: "2026-10-15T02:40:00.000Z", editedAt: null },
          { id: 2, authorId: 2, body: "theirs", createdAt: "2026-10-15T02:41:00.000Z", editedAt: null },
        ],
      },
    });
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await screen.findByText("mine");
    const items = screen.getAllByRole("listitem").filter((li) => /mine|theirs/.test(li.textContent ?? ""));
    const mine = items.find((li) => li.textContent?.includes("mine"))!;
    const theirs = items.find((li) => li.textContent?.includes("theirs"))!;
    expect(within(mine).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(mine).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("is disabled, with the reason, for the view-only instructor", async () => {
    signInAs(50, "INSTRUCTOR");
    installFakeServer(
      mkBoard({ viewer: { userId: 50, isLeader: false, isMember: false, readOnly: true, canCreate: false, canManageBoard: false } },
        three().map((t) => ({ ...t, permissions: NO_PERMS }))),
    );
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    expect(await screen.findByLabelText("Add a comment")).toBeDisabled();
    expect(screen.getAllByText("Instructors and admins have view-only access to tasks.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Watch/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete task" })).toBeDisabled();
  });
});

describe("history", () => {
  it("lists changes in plain language, newest first, with the time", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()), {
      1: {
        activity: [
          { id: 2, actorId: 3, type: "status_changed", data: { from: "TODO", to: "IN_PROGRESS" }, createdAt: "2026-10-15T02:40:00.000Z" },
          { id: 1, actorId: 1, type: "created", data: null, createdAt: "2026-10-14T02:00:00.000Z" },
        ],
      },
    });
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    await user.click(await screen.findByRole("tab", { name: /History/ }));
    const items = within(screen.getByRole("list", { name: "Task history, newest first" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ana Reyes moved it from To do to In progress · Oct 15, 10:40 AM");
    expect(items[1]).toHaveTextContent("Leader Lee created this task");
  });
});

describe("watching", () => {
  it("toggles Watch and shows the watcher count", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, three()), { 1: { watchers: [2, 3] } });
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    const watch = await screen.findByRole("button", { name: /^Watch/ });
    await waitFor(() => expect(watch).toHaveTextContent("(2)"));
    await user.click(watch);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Watching/ })).toHaveTextContent("(3)"));
    expect(server.calls.some((c) => c.method === "PUT" && c.url.endsWith("/watch"))).toBe(true);
    await user.click(screen.getByRole("button", { name: /^Watching/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Watch/ })).toHaveTextContent("(2)"));
  });
});

describe("permissions mirrored with reasons", () => {
  it("an assignee can edit their task but sees assignee and milestone locked with who can change them", async () => {
    signInAs(2);
    installFakeServer(mkBoard({ viewer: { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false } }, [
      mkTask({ id: 1, title: "Mine", assignedToUserId: 2, permissions: ASSIGNEE_PERMS }),
    ]));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Mine/ }));
    await screen.findByRole("dialog", { name: "FT-1" });
    expect(screen.getByLabelText("Priority")).toBeEnabled();
    expect(screen.getByLabelText("Due date")).toBeEnabled();
    const assignee = screen.getByLabelText("Assignee", { selector: "select" });
    expect(assignee).toBeDisabled();
    expect(assignee.closest("[title]")).toHaveAttribute("title", "Only the group leader can do this.");
    expect(screen.getByLabelText("Milestone")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete task" })).toBeDisabled();
    // No suggestion for non-leaders.
    expect(screen.queryByRole("group", { name: "Suggested assignee" })).not.toBeInTheDocument();
  });
});

describe("due date and milestone warnings", () => {
  it("shows a warning box with an icon when the due date is after the project deadline", async () => {
    signInAs(1);
    const deadline = new Date(`${addDays(todayManila(), 10)}T10:00:00Z`).toISOString();
    installFakeServer(mkBoard(
      {
        group: mkGroup({ groupName: "G", deadline }),
        milestones: [{ id: 5, name: "Too late", dueDate: addDays(todayManila(), 20), position: 1, total: 1, done: 0 }],
      },
      [mkTask({ id: 1, title: "Late plan", dueDate: addDays(todayManila(), 20), milestoneId: 5 })],
    ));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Late plan/ }));
    const d = await screen.findByRole("dialog", { name: "FT-1" });
    const warnings = within(d).getAllByRole("status").map((n) => n.textContent ?? "");
    expect(warnings.some((w) => /This is after the project deadline \(/.test(w))).toBe(true);
    expect(warnings.some((w) => /This milestone is due after the project deadline \(/.test(w))).toBe(true);
    expect(d.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("shows no warning when the date is on time", async () => {
    signInAs(1);
    const deadline = new Date(`${addDays(todayManila(), 10)}T10:00:00Z`).toISOString();
    installFakeServer(mkBoard({ group: mkGroup({ groupName: "G", deadline }) }, [mkTask({ id: 1, title: "Fine", dueDate: addDays(todayManila(), 3) })]));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Fine/ }));
    await screen.findByRole("dialog", { name: "FT-1" });
    expect(screen.queryByText(/after the project deadline/)).not.toBeInTheDocument();
  });
});

describe("suggested assignee (leader only)", () => {
  it("suggests a Documentation member for a task linked to a heading, naming the roles, and Confirm assigns", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Write the intro", docHeading: "Introduction" })]));
    renderTab({ onOpenDocument: vi.fn() });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Write the intro/ }));
    const box = await screen.findByRole("group", { name: "Suggested assignee" });
    expect(within(box).getByText("Ana Reyes")).toBeInTheDocument();
    expect(within(box).getByText("Documentation member with the fewest open tasks (0)")).toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(server.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ assignedToUserId: ANA.userId }));
  });

  it("falls back to the fewest open tasks and says no member has the role", async () => {
    signInAs(1);
    installFakeServer(mkBoard(
      { members: [LEADER, BEN] },
      [mkTask({ id: 1, title: "Docs work", docHeading: "Intro" }), mkTask({ id: 2, title: "Busy", assignedToUserId: 1 })],
    ));
    renderTab({ onOpenDocument: vi.fn() });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Docs work/ }));
    const box = await screen.findByRole("group", { name: "Suggested assignee" });
    expect(within(box).getByText("Ben Cruz")).toBeInTheDocument();
    expect(within(box).getByText("Fewest open tasks (0); no Documentation member")).toBeInTheDocument();
  });

  it("Change moves focus to the assignee picker without assigning", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Code it" })]));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Code it/ }));
    const box = await screen.findByRole("group", { name: "Suggested assignee" });
    await user.click(within(box).getByRole("button", { name: "Change" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Assignee", { selector: "select" }));
    expect(server.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});

describe("linked document heading", () => {
  it("lists the document's headings, saves the choice and opens the document", async () => {
    signInAs(1);
    const onOpenDocument = vi.fn();
    const server = installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Intro", docHeading: "Introduction" })]));
    renderTab({ onOpenDocument });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Intro/ }));
    const picker = await screen.findByRole("combobox", { name: "Linked document heading" });
    await waitFor(() => expect(within(picker).getAllByRole("option").map((o) => o.textContent)).toEqual(["No linked heading", "Introduction", "– Methods"]));

    await user.selectOptions(picker, "Methods");
    await waitFor(() => expect(server.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ docHeading: "Methods" }));

    await user.click(await screen.findByRole("button", { name: "Open in document" }));
    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 1, docHeading: "Methods" }));
  });

  it("offers no heading link when the group has no Document tab", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Code only" })]));
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Code only/ }));
    await screen.findByRole("dialog", { name: "FT-1" });
    expect(screen.queryByRole("combobox", { name: "Linked document heading" })).not.toBeInTheDocument();
  });

  it("marks a linked heading that is gone from the document", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, [mkTask({ id: 1, title: "Orphan", docHeading: "Old title" })]));
    renderTab({ onOpenDocument: vi.fn() });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Orphan/ }));
    expect(await screen.findByRole("option", { name: "Old title (not found in the document)" })).toBeInTheDocument();
  });
});

describe("attachments", () => {
  it("shows the storage used and the per-task count", async () => {
    signInAs(1);
    installFakeServer(mkBoard({}, three()), {
      1: { attachments: [{ id: 1, kind: "PDF", mime: "application/pdf", filename: "plan.pdf", size: 2048, createdByUserId: 1, createdAt: "2026-10-15T00:00:00.000Z" }] },
    });
    renderTab();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    expect(await screen.findByText("plan.pdf")).toBeInTheDocument();
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
    expect(screen.getByText("Storage used: 1.2 MB of 50 MB")).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG or WebP up to 1 MB, or a PDF up to 5 MB/)).toBeInTheDocument();
  });

  it("refuses a file that is too big or the wrong type before uploading", async () => {
    signInAs(1);
    const server = installFakeServer(mkBoard({}, three()));
    renderTab();
    const user = userEvent.setup({ applyAccept: false });
    await user.click(await screen.findByRole("button", { name: /First task/ }));
    const input = await screen.findByLabelText("Choose a file to attach");
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    await user.upload(input, big);
    expect(await screen.findByText("That PDF is too large (max 5 MB).")).toBeInTheDocument();
    await user.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await screen.findByText("Choose a JPG, PNG or WebP image.")).toBeInTheDocument();
    expect(server.calls.some((c) => c.method === "POST" && c.url.endsWith("/attachments"))).toBe(false);
  });
});
