import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse } from "@shared/taskTypes";
import * as AuthContextModule from "../../context/AuthContext";
import { ToastProvider } from "../Toast";
import { CommitLinkBar } from "./CommitLinkBar";
import { LinkedCommits } from "./details/LinkedCommits";
import { formatAgo } from "../../lib/tasks/dates";
import { describeActivity } from "../../lib/tasks/activityText";
import { mkBoard, mkGroup, mkTask, resetFixtureIds } from "../../../test/taskFixtures";

vi.mock("../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});
const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

function signInAs(id: number) {
  mockUseAuth.mockReturnValue({
    user: { id, email: "a@example.com", name: "Someone", systemRole: "STUDENT" },
    token: "t", loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
}

interface Call { method: string; url: string; body?: Record<string, unknown> }

function serve(handlers: Record<string, () => { status: number; body: unknown }>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const h = handlers[`${method} ${url}`];
    const r = h ? h() : { status: 404, body: { error: "unhandled" } };
    return { ok: r.status < 400, status: r.status, json: async () => structuredClone(r.body) };
  }));
  return calls;
}

function renderBar(board: BoardResponse) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider><CommitLinkBar board={board} /></ToastProvider>
    </QueryClientProvider>,
  );
}

const member = { userId: 2, isLeader: false, isMember: true, readOnly: false, canCreate: true, canManageBoard: false };

beforeEach(() => { resetFixtureIds(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.useRealTimers(); });

describe("CommitLinkBar", () => {
  it("leader: shows the hint, the last refresh time and a Refresh commits button; posting links and says how many", async () => {
    signInAs(1);
    const recent = new Date(Date.now() - 3 * 60_000).toISOString();
    const calls = serve({
      "POST /api/groups/7/tasks/sync-commits": () => ({ status: 200, body: { linked: 2, matched: 2, scanned: 40, commitsRefreshedAt: new Date().toISOString() } }),
      "GET /api/groups/7/tasks": () => ({ status: 200, body: mkBoard() }),
    });
    renderBar(mkBoard({ group: mkGroup({ commitsRefreshedAt: recent }) }));
    expect(screen.getByText(/Put a task's key, like/)).toHaveTextContent("FT-12");
    expect(screen.getByText("Last refreshed 3 min ago")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh commits" }));
    expect(await screen.findByText("Commits refreshed. Linked 2 new commits.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/groups/7/tasks/sync-commits")).toBe(true);
  });

  it("says 'Not refreshed yet' before the first refresh", () => {
    signInAs(1);
    serve({});
    renderBar(mkBoard());
    expect(screen.getByText("Not refreshed yet")).toBeInTheDocument();
  });

  it("shows the server's too-soon message with the time left", async () => {
    signInAs(1);
    serve({
      "POST /api/groups/7/tasks/sync-commits": () => ({ status: 429, body: { error: "Commits were refreshed a moment ago. Try again in 4 minutes.", retryAfterSeconds: 240 } }),
      "GET /api/groups/7/tasks": () => ({ status: 200, body: mkBoard() }),
    });
    renderBar(mkBoard());
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh commits" }));
    const alerts = await screen.findAllByText("Commits were refreshed a moment ago. Try again in 4 minutes.");
    expect(alerts.length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Refresh commits" })).toBeEnabled();
  });

  it("a member sees the hint but no Refresh button and no key control", () => {
    signInAs(2);
    renderBar(mkBoard({ viewer: member }));
    expect(screen.getByText(/Put a task's key, like/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh commits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change/ })).not.toBeInTheDocument();
  });

  it("a group without a repository says so and offers no refresh (the leader can still change the key)", () => {
    signInAs(1);
    renderBar(mkBoard({ group: mkGroup({ hasRepo: false }) }));
    expect(screen.getByText("This group has no GitHub repository, so commits are not linked to tasks.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh commits" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Task key: FT/ })).toBeInTheDocument();
  });

  it("names the earlier keys that still link", () => {
    signInAs(2);
    renderBar(mkBoard({ viewer: member, group: mkGroup({ taskKey: "APP", keyAliases: ["FT", "GA"] }) }));
    expect(screen.getByText(/Earlier keys still link: FT, GA\./)).toBeInTheDocument();
  });

  it("change key: sends the upper-cased key, and shows the server's reason when it refuses", async () => {
    signInAs(1);
    let answer: { status: number; body: unknown } = { status: 409, body: { error: "FT was this group's key before, so it can't be used again." } };
    const calls = serve({
      "PATCH /api/groups/7/task-key": () => answer,
      "GET /api/groups/7/tasks": () => ({ status: 200, body: mkBoard() }),
    });
    renderBar(mkBoard({ group: mkGroup({ taskKey: "APP" }) }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Task key: APP/ }));
    const dialog = screen.getByRole("dialog", { name: "Change task key" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const input = screen.getByLabelText("New key");
    await user.clear(input);
    await user.type(input, "ft");
    expect(input).toHaveValue("FT");
    await user.click(screen.getByRole("button", { name: "Change key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("FT was this group's key before");
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ key: "FT" });

    answer = { status: 200, body: { taskKey: "GA", keyAliases: ["APP"] } };
    await user.clear(input);
    await user.type(input, "ga");
    await user.click(screen.getByRole("button", { name: "Change key" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Task key is now GA. APP-… in commit messages still links.")).toBeInTheDocument();
  });

  it("change key: Esc closes without sending anything", async () => {
    signInAs(1);
    const calls = serve({});
    renderBar(mkBoard());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Task key: FT/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });
});

describe("LinkedCommits", () => {
  const task = mkTask({ id: 1 });

  it("lists commits with a safe GitHub link, author and time", () => {
    render(
      <LinkedCommits
        task={task}
        hasRepo
        commits={[{
          sha: "a41f9c2d0000", shortSha: "a41f9c2", message: "FT-1: add login", authorLogin: "ana-dev",
          committedAt: "2026-10-15T02:40:00.000Z", url: "https://github.com/acme/app/commit/a41f9c2d0000",
        }]}
      />,
    );
    const link = screen.getByRole("link", { name: "Commit a41f9c2 on GitHub (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/commit/a41f9c2d0000");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("FT-1: add login")).toBeInTheDocument();
    expect(screen.getByText(/ana-dev · Oct 15, 10:40 AM/)).toBeInTheDocument();
  });

  it("shows no link when the server sent no url", () => {
    render(<LinkedCommits task={task} hasRepo commits={[{ sha: "abc1234", shortSha: "abc1234", message: "FT-1", authorLogin: null, committedAt: "2026-10-15T02:40:00.000Z", url: null }]} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
  });

  it("explains how to link when there are none, or that there is no repository", () => {
    const { rerender } = render(<LinkedCommits task={task} hasRepo commits={[]} />);
    expect(screen.getByText(/No commits linked yet\./)).toHaveTextContent("FT-1");
    rerender(<LinkedCommits task={task} hasRepo={false} commits={[]} />);
    expect(screen.getByText("This group has no GitHub repository, so commits are not linked.")).toBeInTheDocument();
  });
});

describe("formatAgo and the History line", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  it("words the time since", () => {
    expect(formatAgo("2026-10-18T11:59:40Z", now)).toBe("just now");
    expect(formatAgo("2026-10-18T11:57:00Z", now)).toBe("3 min ago");
    expect(formatAgo("2026-10-18T09:00:00Z", now)).toBe("3 h ago");
    expect(formatAgo("2026-10-15T12:00:00Z", now)).toBe("3 d ago");
    expect(formatAgo("2026-10-18T12:00:30Z", now)).toBe("just now");
  });

  it("History reads 'Commit a41f9c2 was linked' without a person as the actor", () => {
    const board = { members: [], milestones: [], labels: [] };
    const entry = { id: 1, actorId: null, type: "commit_linked" as const, data: { sha: "a41f9c2d0000", authorLogin: "ana-dev" }, createdAt: "2026-10-15T02:40:00.000Z" };
    expect(describeActivity(entry, board)).toBe("Commit a41f9c2 was linked (by ana-dev)");
    expect(describeActivity({ ...entry, data: { sha: "a41f9c2d0000", authorLogin: null } }, board)).toBe("Commit a41f9c2 was linked");
  });
});
