import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLLAB_PERSIST_DEBOUNCE_MS } from "@shared/collabVersion";
import { SAVE_SETTLE_MS, SAVE_STATE_TEXT, saveStateOf, type ProviderStatus } from "./saveState";

const base = { synced: true, dirty: false, hasConnected: true };

describe("saveStateOf", () => {
  it("connected + synced + nothing pending = saved", () => {
    expect(saveStateOf({ ...base, status: "connected" })).toBe("saved");
  });
  it("connected + synced + local edit pending = saving", () => {
    expect(saveStateOf({ ...base, status: "connected", dirty: true })).toBe("saving");
  });
  it("connected but not yet synced = connecting (never saved)", () => {
    expect(saveStateOf({ ...base, status: "connected", synced: false })).toBe("connecting");
    expect(saveStateOf({ ...base, status: "connected", synced: false, dirty: true })).toBe("connecting");
  });
  it("first connection attempt = connecting", () => {
    expect(saveStateOf({ status: "connecting", synced: false, dirty: false, hasConnected: false })).toBe("connecting");
  });
  it("lost connection = offline, also while a reconnect is being tried", () => {
    expect(saveStateOf({ ...base, status: "disconnected" })).toBe("offline");
    expect(saveStateOf({ ...base, status: "connecting", synced: false })).toBe("offline");
  });
  it("never says saved unless connected, synced and not dirty (all combinations)", () => {
    const statuses: ProviderStatus[] = ["connecting", "connected", "disconnected"];
    for (const status of statuses) for (const synced of [true, false]) for (const dirty of [true, false]) for (const hasConnected of [true, false]) {
      const r = saveStateOf({ status, synced, dirty, hasConnected });
      if (r === "saved") expect(status === "connected" && synced && !dirty).toBe(true);
    }
  });
  it("plain wording", () => {
    expect(SAVE_STATE_TEXT).toEqual({
      connecting: "Connecting…",
      saving: "Saving…",
      saved: "All changes saved",
      offline: "Offline. Changes will sync when you reconnect.",
    });
  });
});

describe("settle delay follows the server's save debounce", () => {
  it("is longer than the debounce", () => {
    expect(SAVE_SETTLE_MS).toBeGreaterThan(COLLAB_PERSIST_DEBOUNCE_MS);
  });
  it("shared value equals the debounce in server/src/collab/persistence.ts", () => {
    const src = readFileSync(resolve(__dirname, "../../../server/src/collab/persistence.ts"), "utf8");
    const m = src.match(/const DEBOUNCE_MS = (\d+);/);
    expect(m, "persistence.ts no longer has a numeric DEBOUNCE_MS; update this test").not.toBeNull();
    expect(Number(m![1])).toBe(COLLAB_PERSIST_DEBOUNCE_MS);
  });
});
