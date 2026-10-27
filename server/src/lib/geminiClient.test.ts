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
import { generateJson, AiReviewError } from "./geminiClient.js";

const schema = { type: "object" };
const rejection = (p: Promise<unknown>): Promise<AiReviewError> =>
  p.then(() => { throw new Error("expected a rejection"); }, (e: unknown) => e as AiReviewError);
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
  it("stops after the cap and resets at midnight Pacific (Google's reset), not UTC", () => {
    process.env.AI_REVIEW_DAILY_CALL_CAP = "2";
    resetDailyBudgetForTests();
    const d1 = new Date("2026-10-26T10:00:00Z");
    expect([takeDailyBudget(d1), takeDailyBudget(d1), takeDailyBudget(d1)]).toEqual([true, true, false]);
    // UTC midnight is 5 pm Pacific: still the same Pacific day, still no calls left.
    expect(takeDailyBudget(new Date("2026-10-27T00:00:01Z"))).toBe(false);
    // A call counted just before Pacific midnight (07:00Z in October) does not count after it.
    resetDailyBudgetForTests();
    const before = new Date("2026-10-27T06:59:59Z");
    expect([takeDailyBudget(before), takeDailyBudget(before), takeDailyBudget(before)]).toEqual([true, true, false]);
    expect(takeDailyBudget(new Date("2026-10-27T07:00:01Z"))).toBe(true);
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
    const err = await rejection(generateJson(req));
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
    const p = rejection(generateJson(req));
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await p).code).toBe("AI_RATE_LIMITED");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("times out", async () => {
    vi.useFakeTimers();
    generateContent.mockImplementation(() => new Promise(() => {}));
    const p = rejection(generateJson({ ...req, timeoutMs: 1000 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect((await p).code).toBe("AI_TIMEOUT");
  });

  describe("with files", () => {
    const file = { mimeType: "application/pdf", data: Buffer.from("%PDF-1.4 synthetic") };

    it("sends the files as inline data parts before the prompt, and a plain string without files", async () => {
      generateContent.mockResolvedValue({ text: '{"ok": true}' });
      await generateJson({ ...req, files: [file] });
      const contents = generateContent.mock.calls[0]![0].contents;
      expect(contents).toEqual([{
        role: "user",
        parts: [{ inlineData: { mimeType: "application/pdf", data: file.data.toString("base64") } }, { text: "p" }],
      }]);
      await generateJson(req);
      expect(generateContent.mock.calls[1]![0].contents).toBe("p");
      await generateJson({ ...req, files: [] });
      expect(generateContent.mock.calls[2]![0].contents).toBe("p");
    });

    it("waits 60 s with files and 45 s without", async () => {
      vi.useFakeTimers();
      generateContent.mockImplementation(() => new Promise(() => {}));
      let settled: string | null = null;
      const withFiles = rejection(generateJson({ ...req, files: [file] })).then((e) => { settled = e.code; });
      await vi.advanceTimersByTimeAsync(50_000);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(11_000);
      await withFiles;
      expect(settled).toBe("AI_TIMEOUT");

      let plain: string | null = null;
      const noFiles = rejection(generateJson(req)).then((e) => { plain = e.code; });
      await vi.advanceTimersByTimeAsync(46_000);
      await noFiles;
      expect(plain).toBe("AI_TIMEOUT");
    });

    it("maps a 400 to AI_BAD_INPUT only when files were sent, without leaking provider text or file bytes", async () => {
      generateContent.mockRejectedValue(Object.assign(new Error("bad pdf data " + file.data.toString("base64")), { status: 400 }));
      const err = await rejection(generateJson({ ...req, files: [file] }));
      expect(err.code).toBe("AI_BAD_INPUT");
      expect(err.message).toBe("AI_BAD_INPUT");
      const plain = await rejection(generateJson(req));
      expect(plain.code).toBe("AI_UNAVAILABLE");
      expect(generateContent).toHaveBeenCalledTimes(2);
    });
  });

  const quotaBody = (quotaId: string, retryDelay: string) =>
    JSON.stringify({
      error: {
        code: 429,
        details: [
          { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
          { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
        ],
      },
    });

  it("does not retry a per-day quota: one call, AI_QUOTA_DAILY with the reset delay, no provider text", async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error(quotaBody("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "14309s")), { status: 429 }),
    );
    const err = await rejection(generateJson(req));
    expect(err.code).toBe("AI_QUOTA_DAILY");
    expect(err.retryAfterMs).toBe(14_309_000);
    expect(err.message).toBe("AI_QUOTA_DAILY");
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("retries a per-minute limit once, waiting the asked delay capped at 20 s", async () => {
    vi.useFakeTimers();
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error(quotaBody("GenerateRequestsPerMinutePerProjectPerModel", "534036052s")), { status: 429 }))
      .mockResolvedValueOnce({ text: '{"ok": true}' });
    const p = generateJson(req);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(generateContent).toHaveBeenCalledTimes(1); // still waiting: a huge delay is capped, not skipped
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
