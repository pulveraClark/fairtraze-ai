import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STILL_CONNECTING_MS } from "../lib/useCollabSync";

// A stand-in for y-websocket's provider: it never talks to a network, and the test decides when
// (or whether) the first sync happens.
const { created, FakeProvider } = vi.hoisted(() => {
const created: unknown[] = [];
class FakeProvider {
  synced = false;
  awareness = {
    setLocalStateField: vi.fn(),
    getStates: () => new Map(),
    on: vi.fn(),
    off: vi.fn(),
    getLocalState: () => null,
    setLocalState: vi.fn(),
  };
  private handlers = new Map<string, Set<(arg: never) => void>>();
  connect = vi.fn();
  disconnect = vi.fn();
  destroy = vi.fn();
  constructor() { created.push(this); }
  on(event: string, cb: (arg: never) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }
  off(event: string, cb: (arg: never) => void) { this.handlers.get(event)?.delete(cb); }
  emit(event: string, arg: unknown) { this.handlers.get(event)?.forEach((cb) => cb(arg as never)); }
  finishSync() { this.synced = true; this.emit("status", { status: "connected" }); this.emit("sync", true); }
}
return { created: created as FakeProvider[], FakeProvider };
});

vi.mock("y-websocket", () => ({ WebsocketProvider: FakeProvider }));
// Stable object: the editor re-runs its presence effect whenever `user` changes identity.
const auth = vi.hoisted(() => ({ token: "t", user: { id: 1, name: "Ana", email: "a@x.com", systemRole: "STUDENT" } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/useCollabVersionGuard", () => ({ useCollabVersionGuard: () => ({ mismatch: false }) }));

import { DocumentEditor } from "./DocumentEditor";

const isEditable = () => document.querySelector(".ProseMirror")?.getAttribute("contenteditable");

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("DocumentEditor first sync", () => {
  it("keeps a member read-only until the first sync completes, then lets them type", async () => {
    render(<DocumentEditor groupId={1} editable />);
    await waitFor(() => expect(isEditable()).toBe("false"));
    expect(screen.getAllByText("Connecting to the shared document…").length).toBeGreaterThan(0);
    act(() => created[0].finishSync());
    await waitFor(() => expect(isEditable()).toBe("true"));
    expect(screen.queryByText("Connecting to the shared document…")).not.toBeInTheDocument();
  });

  it("never makes a read-only viewer editable, even after the sync completes", async () => {
    render(<DocumentEditor groupId={1} editable={false} />);
    await waitFor(() => expect(isEditable()).toBe("false"));
    act(() => created[0].finishSync());
    await waitFor(() => expect(screen.queryByText("Connecting to the shared document…")).not.toBeInTheDocument());
    expect(isEditable()).toBe("false");
  });

  it("says it is still connecting when the document never syncs, and Retry reconnects", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<DocumentEditor groupId={1} editable />);
      expect(isEditable()).toBe("false");
      await act(async () => { vi.advanceTimersByTime(STILL_CONNECTING_MS + 1); });
      expect(screen.getByText("Still connecting. Check your internet, or reload")).toBeInTheDocument();
      expect(isEditable()).toBe("false");
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole("button", { name: "Retry" }));
      expect(created[0].disconnect).toHaveBeenCalled();
      expect(created[0].connect).toHaveBeenCalled();
      expect(screen.queryByText(/Still connecting/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
