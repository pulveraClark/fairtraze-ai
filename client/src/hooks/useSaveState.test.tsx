import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import * as Y from "yjs";
import { useSaveState } from "./useSaveState";
import { SAVE_SETTLE_MS } from "../lib/saveState";
import type { SaveState } from "../lib/saveState";
import type { WebsocketProvider } from "y-websocket";

// A small stand-in for y-websocket's provider: status/sync events, wsconnected, synced, ws.bufferedAmount.
class FakeProvider {
  wsconnected = true;
  wsconnecting = false;
  synced = true;
  ws = { bufferedAmount: 0 };
  private h = new Map<string, Set<(...a: never[]) => void>>();
  on(e: string, f: (...a: never[]) => void) {
    if (!this.h.has(e)) this.h.set(e, new Set());
    this.h.get(e)!.add(f);
  }
  off(e: string, f: (...a: never[]) => void) { this.h.get(e)?.delete(f); }
  emit(e: string, ...a: unknown[]) { this.h.get(e)?.forEach((f) => (f as (...x: unknown[]) => void)(...a)); }
  count() { return Array.from(this.h.values()).reduce((n, s) => n + s.size, 0); }
}

let latest: SaveState | null = null;
function Probe({ p, d, enabled = true }: { p: FakeProvider; d: Y.Doc; enabled?: boolean }) {
  latest = useSaveState(p as unknown as WebsocketProvider, d, enabled);
  return null;
}
const typeText = (d: Y.Doc, t: string) => d.getText("t").insert(0, t); // origin null = a local edit

describe("useSaveState", () => {
  beforeEach(() => { vi.useFakeTimers(); latest = null; });
  afterEach(() => vi.useRealTimers());

  it("starts saved, goes saving on a local edit, saved again after the settle delay", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    render(<Probe p={p} d={d} />);
    expect(latest).toBe("saved");
    act(() => typeText(d, "a"));
    expect(latest).toBe("saving");
    act(() => { vi.advanceTimersByTime(SAVE_SETTLE_MS - 1); });
    expect(latest).toBe("saving");
    act(() => { vi.advanceTimersByTime(2); });
    expect(latest).toBe("saved");
  });

  it("an update that came from the provider (other people's text) does not make it dirty", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    render(<Probe p={p} d={d} />);
    act(() => d.transact(() => typeText(d, "remote"), p));
    expect(latest).toBe("saved");
  });

  it("stays saving while bytes are still in the socket buffer", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    render(<Probe p={p} d={d} />);
    p.ws.bufferedAmount = 10;
    act(() => typeText(d, "a"));
    act(() => { vi.advanceTimersByTime(SAVE_SETTLE_MS + 100); });
    expect(latest).toBe("saving");
    p.ws.bufferedAmount = 0;
    act(() => { vi.advanceTimersByTime(600); });
    expect(latest).toBe("saved");
  });

  it("offline edits show offline, never saved; after reconnect and sync they settle to saved", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    render(<Probe p={p} d={d} />);
    act(() => { p.wsconnected = false; p.synced = false; p.emit("status", { status: "disconnected" }); p.emit("sync", false); });
    expect(latest).toBe("offline");
    act(() => typeText(d, "typed offline"));
    act(() => { vi.advanceTimersByTime(SAVE_SETTLE_MS + 5000); });
    expect(latest).toBe("offline");
    act(() => { p.wsconnected = true; p.emit("status", { status: "connected" }); });
    expect(latest).toBe("connecting"); // connected but not synced yet
    act(() => { p.synced = true; p.emit("sync", true); });
    expect(latest).toBe("saving");
    act(() => { vi.advanceTimersByTime(SAVE_SETTLE_MS + 1); });
    expect(latest).toBe("saved");
  });

  it("reports nothing when disabled (read-only view) and adds no listeners", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    render(<Probe p={p} d={d} enabled={false} />);
    expect(latest).toBeNull();
    expect(p.count()).toBe(0);
  });

  it("removes its listeners and timer on unmount (also under StrictMode)", () => {
    const p = new FakeProvider(); const d = new Y.Doc();
    const { unmount } = render(<StrictMode><Probe p={p} d={d} /></StrictMode>);
    act(() => typeText(d, "a"));
    expect(p.count()).toBe(2);
    unmount();
    expect(p.count()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => act(() => typeText(d, "b"))).not.toThrow(); // no listener left to set state
  });
});
