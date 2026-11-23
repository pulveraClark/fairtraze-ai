import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ACTIVE_GRACE_DAYS } from "../src/lib/autoAnalysis.js";

// The server decides which projects are analyzed automatically; the client says "Final report, no more
// updates" once the same window has passed. If the two numbers drift apart, a page would promise updates
// that never come (or stop promising ones that do).
describe("auto-analysis grace window", () => {
  it("the client's AUTO_ANALYSIS_GRACE_DAYS equals the server's ACTIVE_GRACE_DAYS", () => {
    const file = readFileSync(path.resolve(__dirname, "../../client/src/lib/analysisFreshness.ts"), "utf8");
    const match = /export const AUTO_ANALYSIS_GRACE_DAYS\s*=\s*(\d+)/.exec(file);
    expect(match, "constant not found in client/src/lib/analysisFreshness.ts").not.toBeNull();
    expect(Number(match![1])).toBe(ACTIVE_GRACE_DAYS);
  });
});
