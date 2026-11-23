import { describe, it, expect } from "vitest";
import { tryAcquireAnalysis, releaseAnalysis, isAnalysisRunning, withAnalysisLock } from "./analysisLock.js";

describe("analysis lock", () => {
  it("a second acquire for the same group fails until released; other groups are free", () => {
    expect(tryAcquireAnalysis(9001)).toBe(true);
    expect(tryAcquireAnalysis(9001)).toBe(false);
    expect(tryAcquireAnalysis(9002)).toBe(true);
    releaseAnalysis(9001);
    expect(tryAcquireAnalysis(9001)).toBe(true);
    releaseAnalysis(9001);
    releaseAnalysis(9002);
  });

  it("withAnalysisLock skips while another run holds the group, and releases after a throw", async () => {
    let inner: Awaited<ReturnType<typeof withAnalysisLock<string>>> | undefined;
    const outer = await withAnalysisLock(9003, async () => {
      inner = await withAnalysisLock(9003, async () => "second");
      return "first";
    });
    expect(outer).toEqual({ ran: true, value: "first" });
    expect(inner).toEqual({ ran: false });

    await expect(withAnalysisLock(9003, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(isAnalysisRunning(9003)).toBe(false);
  });
});
