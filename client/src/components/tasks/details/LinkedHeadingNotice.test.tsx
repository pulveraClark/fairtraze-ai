import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoardResponse } from "@shared/taskTypes";
import * as AuthContextModule from "../../../context/AuthContext";
import { ToastProvider } from "../../Toast";
import { LinkedHeadingNotice } from "./LinkedHeadingNotice";
import { useDocHeadingFocus } from "../../../hooks/useDocHeadingFocus";
import { ASSIGNEE_PERMS, mkBoard, mkTask, NO_PERMS, resetFixtureIds } from "../../../../test/taskFixtures";

vi.mock("../../../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../../../context/AuthContext");
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

function serve(board: BoardResponse) {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => structuredClone(data) });
    if (url === "/api/groups/7/tasks") return ok(board);
    if (url === "/api/groups/7/document/headings") return ok({ headings: [{ level: 1, text: "Introduction" }, { level: 2, text: "Results" }] });
    if (method === "PATCH") return ok({ ...board.tasks[0], version: 2 });
    return { ok: false, status: 404, json: async () => ({ error: "unhandled" }) };
  }));
  return calls;
}

function renderNotice(onRelink = vi.fn(), onDismiss = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <LinkedHeadingNotice
          projectId={7}
          focus={{ taskId: 1, taskKey: "FT-1", heading: "Old title", missing: true }}
          onRelink={onRelink}
          onDismiss={onDismiss}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { onRelink, onDismiss };
}

beforeEach(() => { resetFixtureIds(); });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("LinkedHeadingNotice (heading renamed or removed)", () => {
  it("says so, and lets the assignee pick a new heading, which is saved on the task", async () => {
    signInAs(2);
    const calls = serve(mkBoard({}, [mkTask({ id: 1, docHeading: "Old title", assignedToUserId: 2, permissions: ASSIGNEE_PERMS })]));
    const { onRelink } = renderNotice();
    expect(screen.getByRole("status")).toHaveTextContent('That heading was renamed or removed. FT-1 is linked to "Old title"');

    const user = userEvent.setup();
    const picker = await screen.findByRole("combobox", { name: "Linked document heading" });
    await waitFor(() => expect(screen.getByRole("option", { name: "– Results" }).parentElement).toBe(picker));
    await user.selectOptions(picker, "Results");
    await waitFor(() => expect(onRelink).toHaveBeenCalledWith("Results"));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ docHeading: "Results", expectedVersion: 1 });
  });

  it("only explains it to people who cannot edit the task, with no picker", async () => {
    signInAs(3);
    serve(mkBoard({}, [mkTask({ id: 1, docHeading: "Old title", permissions: NO_PERMS })]));
    const { onDismiss } = renderNotice();
    expect(await screen.findByText("The group leader or the assigned member can pick a new heading.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("useDocHeadingFocus", () => {
  const task = mkTask({ id: 4, key: "FT-4", docHeading: "Methods" });

  it("opens the Document tab and remembers the heading to scroll to", () => {
    const goToDocument = vi.fn();
    const { result } = renderHook(() => useDocHeadingFocus(goToDocument));
    act(() => result.current.openAt(task));
    expect(goToDocument).toHaveBeenCalledTimes(1);
    expect(result.current.focus).toEqual({ taskId: 4, taskKey: "FT-4", heading: "Methods", missing: false });
  });

  it("clears once the heading is found, and flags it missing when it is not", () => {
    const { result } = renderHook(() => useDocHeadingFocus(vi.fn()));
    act(() => result.current.openAt(task));
    act(() => result.current.onResolved(false));
    expect(result.current.focus?.missing).toBe(true);
    act(() => result.current.onRelink("Results"));
    expect(result.current.focus).toMatchObject({ heading: "Results", missing: false });
    act(() => result.current.onResolved(true));
    expect(result.current.focus).toBeNull();
  });

  it("opens the document at the top when the task has no linked heading", () => {
    const goToDocument = vi.fn();
    const { result } = renderHook(() => useDocHeadingFocus(goToDocument));
    act(() => result.current.openAt(mkTask({ id: 5, docHeading: null })));
    expect(goToDocument).toHaveBeenCalled();
    expect(result.current.focus).toBeNull();
  });
});
