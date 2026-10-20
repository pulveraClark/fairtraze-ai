import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import * as AuthContextModule from "../context/AuthContext";
import { ToastProvider } from "../components/Toast";
import { useTaskActions } from "./useTaskActions";
import { useTaskBoardQuery } from "./useGroupQueries";
import { LEADER_PERMS, mkBoard, mkTask, resetFixtureIds } from "../../test/taskFixtures";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const reply = (status: number, data: unknown) => ({ ok: status < 400, status, json: async () => data });

/** A fake API where each GET (the poll) and each move POST is answered by hand, so a test controls the order. */
function installControlledServer(initial: BoardResponse) {
  const gets: Deferred<BoardResponse>[] = [];
  const posts: Deferred<{ status: number; body: unknown }>[] = [];
  let first = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      if (first) { first = false; return reply(200, initial); }
      const d = deferred<BoardResponse>();
      gets.push(d);
      return reply(200, await d.promise);
    }
    const d = deferred<{ status: number; body: unknown }>();
    posts.push(d);
    const r = await d.promise;
    return reply(r.status, r.body);
  }));
  return { gets, posts };
}

function setup(board: BoardResponse) {
  vi.mocked(AuthContextModule.useAuth).mockReturnValue({
    user: { id: 1, email: "a@example.com", name: "Leader Lee", systemRole: "STUDENT" },
    token: "t", loading: false,
    register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
  });
  const server = installControlledServer(board);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><ToastProvider>{children}</ToastProvider></QueryClientProvider>
  );
  const hook = renderHook(() => ({ query: useTaskBoardQuery(7), actions: useTaskActions(7) }), { wrapper });
  return { server, client, ...hook };
}

const statusOf = (r: { current: { query: { data?: BoardResponse } } }, id: number) =>
  r.current.query.data?.tasks.find((t) => t.id === id)?.status;

beforeEach(() => { resetFixtureIds(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("a pending move is not overwritten by a poll", () => {
  it("keeps the card in its new column when an older board arrives during the save, then converges", async () => {
    const task = mkTask({ id: 1, status: "TODO", permissions: LEADER_PERMS });
    const board = mkBoard({}, [task]);
    const { server, result, client } = setup(board);
    await waitFor(() => expect(result.current.query.data).toBeDefined());

    // Drop the card in In progress: the save is in flight.
    let moving!: Promise<BoardTask | null>;
    act(() => {
      moving = result.current.actions.moveTask(task, { status: "IN_PROGRESS", afterId: null, beforeId: null });
    });
    await waitFor(() => expect(server.posts).toHaveLength(1));
    expect(statusOf(result, 1)).toBe("IN_PROGRESS");

    // The 10 s poll fires now and the server still answers with the old column.
    act(() => { void client.invalidateQueries({ queryKey: ["group", 1, "tasks", 7] }); });
    await waitFor(() => expect(server.gets.length).toBeGreaterThan(0));
    const stale = server.gets.splice(0);
    await act(async () => { stale.forEach((g) => g.resolve(board)); await new Promise((r) => setTimeout(r, 20)); });
    expect(statusOf(result, 1)).toBe("IN_PROGRESS");

    // The save lands.
    const saved = { ...task, status: "IN_PROGRESS" as const, version: 2 };
    await act(async () => { server.posts[0].resolve({ status: 200, body: saved }); await moving; });
    expect(statusOf(result, 1)).toBe("IN_PROGRESS");

    // The board then refetches once and agrees with the server.
    const after = mkBoard({}, [saved]);
    await waitFor(() => expect(server.gets.length).toBeGreaterThan(0));
    await act(async () => { server.gets.forEach((g) => g.resolve(after)); await Promise.resolve(); });
    await waitFor(() => expect(statusOf(result, 1)).toBe("IN_PROGRESS"));
  });
});
