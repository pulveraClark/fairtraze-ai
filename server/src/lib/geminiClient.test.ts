import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

vi.mock("./aiReview/limiter.js", async (orig) => ({
  ...(await orig<typeof import("./aiReview/limiter.js")>()),
  // No real pacing in unit tests; createLimiter itself is tested below with a fake clock.
  aiReviewLimiter: { schedule: <T,>(fn: () => Promise<T>) => fn() },
}));

import { createLimiter, takeDailyBudget, resetDailyBudgetForTests } from "./aiReview/limiter.js";
import { generateJson, AiReviewError, parseRetryDelayMs } from "./geminiClient.js";

const schema = { type: "object" };
const validate = (v: unknown) => (v && typeof v === "object" && "ok" in (v as object) ? (v as { ok: boolean }) : null);
const req = { system: "s", prompt: "p", schema, validate };

describe("createLimiter", () => {
  it("starts calls at least minSpacingMs apart and caps concurrency", async () => {
    let t = 0;
    const starts: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const limiter = createLimiter({
      minSpacingMs: 100,
      concurrency: 2,
      now: () => t,
      sleep: async (ms) => { t += ms; },
    });
    await Promise.all(
      [1, 2, 3, 4].map((i) =>
        limiter.schedule(async () => {
          starts.push(t);
          running++;
          maxRunning = Math.max(maxRunning, running);
          await Promise.resolve();
          running--;
          return i;
        }),
      ),
    );
    expect(starts.length).toBe(4);
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(100);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });
});

describe("daily budget", () => {
  afterEach(() => { delete process.env.AI_REVIEW_DAILY_CALL_CAP; resetDailyBudgetForTests(); });
  it("stops after the cap and resets the next UTC day", () => {
    process.env.AI_REVIEW_DAILY_CALL_CAP = "2";
    resetDailyBudgetForTests();
    const d1 = new Date("2026-10-26T10:00:00Z");
    expect([takeDailyBudget(d1), takeDailyBudget(d1), takeDailyBudget(d1)]).toEqual([true, true, false]);
    expect(takeDailyBudget(new Date("2026-10-27T00:00:01Z"))).toBe(true);
  });
});

describe("generateJson", () => {
  beforeEach(() => {
    generateContent.mockReset();
    resetDailyBudgetForTests();
    process.env.AI_REVIEW_ENABLED = "true";
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => { vi.useRealTimers(); delete process.env.AI_REVIEW_ENABLED; });

  it("is a soft failure while the kill switch is off", async () => {
    delete process.env.AI_REVIEW_ENABLED;
    await expect(generateJson(req)).rejects.toMatchObject({ code: "AI_DISABLED" });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("returns validated JSON, tolerates code fences and asks for low randomness", async () => {
    generateContent.mockResolvedValue({ text: '```json\n{"ok": true}\n```' });
    await expect(generateJson(req)).resolves.toEqual({ ok: true });
    const config = generateContent.mock.calls[0]![0].config;
    expect(config.temperature).toBe(0);
    expect(config.seed).toBeTypeOf("number");
    expect(config.responseMimeType).toBe("application/json");
  });

  it("maps non-JSON and wrong-shape output to AI_BAD_OUTPUT", async () => {
    generateContent.mockResolvedValueOnce({ text: "sure! here you go" });
    await expect(generateJson(req)).rejects.toMatchObject({ code: "AI_BAD_OUTPUT" });
    generateContent.mockResolvedValueOnce({ text: '{"nope": 1}' });
    await expect(generateJson(req)).rejects.toMatchObject({ code: "AI_BAD_OUTPUT" });
  });

  it("maps a provider failure to AI_UNAVAILABLE without leaking its text", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("secret provider detail"), { status: 503 }));
    const err = await generateJson(req).catch((e) => e as AiReviewError);
    expect(err).toBeInstanceOf(AiReviewError);
    expect(err.code).toBe("AI_UNAVAILABLE");
    expect(err.message).not.toContain("secret provider detail");
  });

  it("retries once on 429 and then succeeds", async () => {
    vi.useFakeTimers();
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error("Please retry in 2s"), { status: 429 }))
      .mockResolvedValueOnce({ text: '{"ok": true}' });
    const p = generateJson(req);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(p).resolves.toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second 429 with AI_RATE_LIMITED", async () => {
    vi.useFakeTimers();
    generateContent.mockRejectedValue(Object.assign(new Error("retry in 1s"), { status: 429 }));
    const p = generateJson(req).catch((e) => e as AiReviewError);
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await p).code).toBe("AI_RATE_LIMITED");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("times out", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => {}));
    const p = generateJson({ ...req, timeoutMs: 1000 }).catch((e) => e as AiReviewError);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await p).code).toBe("AI_TIMEOUT");
  });

  it("parses the retry delay Gemini asks for, capped", () => {
    expect(parseRetryDelayMs(new Error("Please retry in 7.2s."))).toBe(8000);
    expect(parseRetryDelayMs(new Error("retry in 500s"))).toBe(30000);
    expect(parseRetryDelayMs(new Error("no hint"))).toBe(5000);
  });
});
