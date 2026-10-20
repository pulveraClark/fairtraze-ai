import { describe, it, expect, afterEach, vi } from "vitest";
import { readSetupSkipped, storeSetupSkipped } from "./setupSkip";

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe("setupSkip", () => {
  it("is false until stored, then remembered per user and group", () => {
    expect(readSetupSkipped(1, 7)).toBe(false);
    storeSetupSkipped(1, 7);
    expect(readSetupSkipped(1, 7)).toBe(true);
    expect(readSetupSkipped(2, 7)).toBe(false);
    expect(readSetupSkipped(1, 8)).toBe(false);
  });
  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readSetupSkipped(1, 7)).toBe(false);
    expect(() => storeSetupSkipped(1, 7)).not.toThrow();
  });
});
