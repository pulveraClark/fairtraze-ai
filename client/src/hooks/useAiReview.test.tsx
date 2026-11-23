import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAiReview } from "./useAiReview";
import { useGenerateAiReport } from "./useGenerateAiReport";
import type { UseAiReview } from "./useAiReview";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ token: "t" }) }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const check = (text: string) => ({ requirements: [{ text, status: "FOUND" as const, unverified: false, evidence: [] }], nothingFound: false, generatedAt: "x", outdated: false });
const body = (over: object) => ({ enabled: true, running: false, canGenerate: true, hasReport: true, ...over });
const summary = (text: string) => [{ userId: 1, name: "A", isYou: false, githubUsername: null, summary: text }];

/** GET answers come from a queue (the last one repeats); POST answers 202. */
function server(gets: object[]) {
  let i = 0;
  const fetchMock = vi.fn(async (_url: string, init?: { method?: string }) => {
    if (init?.method === "POST") return { status: 202, ok: true, json: async () => ({ running: true }) };
    const b = gets[Math.min(i++, gets.length - 1)];
    return { status: 200, ok: true, json: async () => b };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useAiReview: the two parts change together after Generate", () => {
  it("keeps the last finished result while the run is going, then swaps both parts at once", async () => {
    server([
      body({ summaries: summary("old findings"), briefCheck: check("old check") }),
      body({ running: true, summaries: summary("NEW findings"), briefCheck: check("old check") }), // findings saved first
      body({ running: true, summaries: summary("NEW findings"), briefCheck: check("old check") }),
      body({ running: false, summaries: summary("NEW findings"), briefCheck: check("NEW check") }),
    ]);
    const { result } = renderHook(() => useAiReview(5, "t"));
    await flush();
    expect(result.current.data?.summaries?.[0]?.summary).toBe("old findings");

    await act(async () => { await result.current.start(); });
    await flush();
    await advance(5000);
    expect(result.current.data?.running).toBe(true);
    expect(result.current.data?.summaries?.[0]?.summary).toBe("old findings"); // new findings are not shown yet
    expect(result.current.data?.briefCheck?.requirements[0]?.text).toBe("old check");

    await advance(10_000);
    expect(result.current.data?.running).toBe(false);
    expect(result.current.data?.summaries?.[0]?.summary).toBe("NEW findings");
    expect(result.current.data?.briefCheck?.requirements[0]?.text).toBe("NEW check");
  });

  it("a page that never pressed Generate (students) shows every poll as it arrives", async () => {
    server([
      body({ running: true, summaries: summary("partial"), briefCheck: check("old check") }),
      body({ running: false, summaries: summary("partial"), briefCheck: check("NEW check") }),
    ]);
    const { result } = renderHook(() => useAiReview(5, "t"));
    await flush();
    expect(result.current.data?.summaries?.[0]?.summary).toBe("partial");
    await advance(5000);
    expect(result.current.data?.briefCheck?.requirements[0]?.text).toBe("NEW check");
  });

  it("after the 5-minute limit the latest result is shown and nothing stays hidden", async () => {
    server([
      body({ summaries: summary("old findings") }),
      body({ running: true, summaries: summary("NEW findings") }),
    ]);
    const { result } = renderHook(() => useAiReview(5, "t"));
    await flush();
    await act(async () => { await result.current.start(); });
    await advance(60_000);
    expect(result.current.data?.summaries?.[0]?.summary).toBe("old findings");
    await advance(5 * 60_000);
    expect(result.current.data?.running).toBe(false);
    expect(result.current.data?.summaries?.[0]?.summary).toBe("NEW findings");
  });

  it("one part failing leaves the other part visible", async () => {
    server([
      body({ summaries: summary("old") }),
      body({ running: false, summaries: summary("NEW findings"), briefFailed: true, briefCheck: undefined }),
    ]);
    const { result } = renderHook(() => useAiReview(5, "t"));
    await flush();
    await act(async () => { await result.current.start(); });
    await advance(6000);
    expect(result.current.data?.summaries?.[0]?.summary).toBe("NEW findings");
    expect(result.current.data?.briefFailed).toBe(true);
  });
});

describe("useGenerateAiReport: the explanation waits for the review", () => {
  function review(running: boolean): UseAiReview {
    return { data: body({ running }) as never, error: null, start: vi.fn(async () => true) };
  }

  it("applies the new explanation only when the review has stopped running", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ narrative: "NEW explanation" }) })));
    const onNarrative = vi.fn();
    const r = review(true);
    const { result, rerender } = renderHook(({ rv }: { rv: UseAiReview }) => useGenerateAiReport(5, rv, onNarrative), { initialProps: { rv: r } });
    await act(async () => { await result.current.generate(true); });
    await flush();
    expect(onNarrative).not.toHaveBeenCalled();
    expect(result.current.generating).toBe(true);

    rerender({ rv: review(false) });
    await flush();
    expect(onNarrative).toHaveBeenCalledWith("NEW explanation");
    expect(result.current.generating).toBe(false);
  });

  it("without AI review the explanation is applied at once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ narrative: "text" }) })));
    const onNarrative = vi.fn();
    const rv: UseAiReview = { data: { enabled: false } as never, error: null, start: vi.fn(async () => false) };
    const { result } = renderHook(() => useGenerateAiReport(5, rv, onNarrative));
    await act(async () => { await result.current.generate(false); });
    expect(onNarrative).toHaveBeenCalledWith("text");
    expect(result.current.generating).toBe(false);
  });

  it("a failed explanation still ends the loading state when the review finishes, and shows the error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ error: "The AI is busy. Try again in a minute." }) })));
    const { result, rerender } = renderHook(({ rv }: { rv: UseAiReview }) => useGenerateAiReport(5, rv, vi.fn()), { initialProps: { rv: review(true) } });
    await act(async () => { await result.current.generate(false); });
    expect(result.current.error).toBe("The AI is busy. Try again in a minute.");
    rerender({ rv: review(false) });
    await flush();
    expect(result.current.generating).toBe(false);
  });
});
