import { describe, it, expect, afterEach, vi } from "vitest";
import { readSidebarCollapsed, writeSidebarCollapsed } from "./sidebarPrefs";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("sidebarPrefs", () => {
  it("remembers the collapsed state per user", () => {
    writeSidebarCollapsed(1, true);
    expect(readSidebarCollapsed(1)).toBe(true);
    expect(readSidebarCollapsed(2)).toBe(false);
    writeSidebarCollapsed(1, false);
    expect(readSidebarCollapsed(1)).toBe(false);
  });

  it("falls back to expanded and never throws when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readSidebarCollapsed(1)).toBe(false);
    expect(() => writeSidebarCollapsed(1, true)).not.toThrow();
  });
});
