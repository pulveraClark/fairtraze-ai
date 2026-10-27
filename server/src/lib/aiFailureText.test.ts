import { describe, it, expect } from "vitest";
import { plainAiFailure, attemptNote, activeQuotaLimit, aiFailureOf, NARRATIVE_UNAVAILABLE_TEXT } from "./aiFailureText.js";
import { AiReviewError } from "./geminiClient.js";

describe("plainAiFailure", () => {
  it("words a daily quota with the hours until reset, when known", () => {
    expect(plainAiFailure("AI_QUOTA_DAILY", 14_309_000)).toBe("The AI's daily limit was reached. It resets in about 4 hours. Try again later.");
    expect(plainAiFailure("AI_QUOTA_DAILY", 60_000)).toBe("The AI's daily limit was reached. It resets in about 1 hour. Try again later.");
  });
  it("leaves the time out when unknown", () => {
    expect(plainAiFailure("AI_QUOTA_DAILY")).toBe("The AI's daily limit was reached. Try again later.");
    expect(plainAiFailure("AI_QUOTA_DAILY", null)).toBe("The AI's daily limit was reached. Try again later.");
  });
  it("keeps the existing plain text for every other failure and never echoes raw text", () => {
    for (const code of ["AI_RATE_LIMITED", "AI_TIMEOUT", "AI_UNAVAILABLE", "secret provider detail", null]) {
      expect(plainAiFailure(code)).toBe(NARRATIVE_UNAVAILABLE_TEXT);
    }
  });
});

describe("aiFailureOf", () => {
  it("keeps the code and reset delay of an AiReviewError, and maps anything else to AI_UNAVAILABLE", () => {
    expect(aiFailureOf(new AiReviewError("AI_QUOTA_DAILY", undefined, 5000))).toEqual({ code: "AI_QUOTA_DAILY", retryAfterMs: 5000 });
    expect(aiFailureOf(new Error("boom"))).toEqual({ code: "AI_UNAVAILABLE", retryAfterMs: null });
  });
});

describe("attemptNote", () => {
  const now = new Date("2026-10-27T11:00:00Z");
  it("stores the reset time only for a daily quota", () => {
    expect(attemptNote({ status: "FAILED", errorCode: "AI_QUOTA_DAILY", retryAfterMs: 3_600_000 }, now)).toEqual({
      at: "2026-10-27T11:00:00.000Z", errorCode: "AI_QUOTA_DAILY", retryAt: "2026-10-27T12:00:00.000Z",
    });
    expect(attemptNote({ status: "FAILED", errorCode: "AI_TIMEOUT", retryAfterMs: 3_600_000 }, now)).toEqual({
      at: "2026-10-27T11:00:00.000Z", errorCode: "AI_TIMEOUT",
    });
  });
  it("writes nothing for a clean or skipped run", () => {
    expect(attemptNote({ status: "OK", errorCode: null }, now)).toBeUndefined();
    expect(attemptNote({ status: "SKIPPED", errorCode: null }, now)).toBeUndefined();
  });
});

describe("activeQuotaLimit", () => {
  const now = new Date("2026-10-27T11:00:00Z");
  it("is active until the reset time passes and picks the latest", () => {
    const a = { at: "x", errorCode: "AI_QUOTA_DAILY", retryAt: "2026-10-27T13:00:00.000Z" };
    const b = { at: "x", errorCode: "AI_QUOTA_DAILY", retryAt: "2026-10-27T15:00:00.000Z" };
    expect(activeQuotaLimit([a, b, undefined], now)).toEqual({ retryAt: "2026-10-27T15:00:00.000Z" });
    expect(activeQuotaLimit([a], new Date("2026-10-27T13:00:01Z"))).toBeNull();
  });
  it("stays active with no known reset time, and ignores other errors", () => {
    expect(activeQuotaLimit([{ at: "x", errorCode: "AI_QUOTA_DAILY" }], now)).toEqual({ retryAt: null });
    expect(activeQuotaLimit([{ at: "x", errorCode: "AI_TIMEOUT" }], now)).toBeNull();
  });
});
