import { describe, it, expect } from "vitest";
import { parseDelayMs, parseQuotaError, retryWaitMs, MAX_RETRY_WAIT_MS, DEFAULT_RETRY_WAIT_MS } from "./aiQuota.js";

// The shape the Gemini SDK puts in ApiError.message: the Google RPC body as a JSON string.
const body = (quotaId: string, retryDelay: string) =>
  JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota, limit: 20, model: gemini-2.5-flash-lite",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generate_content_free_tier_requests", quotaId, quotaValue: "20" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay },
      ],
    },
  });

describe("parseDelayMs", () => {
  it("reads seconds, fractional seconds and milliseconds", () => {
    expect(parseDelayMs("14309s")).toBe(14_309_000);
    expect(parseDelayMs("1.5s")).toBe(1500);
    expect(parseDelayMs("250ms")).toBe(250);
    expect(parseDelayMs("3")).toBe(3000);
  });
  it("rejects anything else", () => {
    for (const v of ["", "soon", "-4s", "5 minutes", null, undefined, {}]) expect(parseDelayMs(v)).toBeNull();
  });
});

describe("parseQuotaError", () => {
  it("detects a per-day quota and the RetryInfo delay in a JSON message", () => {
    const err = Object.assign(new Error(body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "14309s")), { status: 429 });
    expect(parseQuotaError(err)).toEqual({ daily: true, retryAfterMs: 14_309_000 });
  });
  it("treats a per-minute quota as not daily", () => {
    const err = Object.assign(new Error(body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "22s")), { status: 429 });
    expect(parseQuotaError(err)).toEqual({ daily: false, retryAfterMs: 22_000 });
  });
  it("reads structured details on the error object", () => {
    const parsed = JSON.parse(body("GenerateRequestsPerDayPerProjectPerModel", "1.5s"));
    expect(parseQuotaError({ status: 429, message: "x", error: parsed.error })).toEqual({ daily: true, retryAfterMs: 1500 });
  });
  it("reads JSON that follows text, and milliseconds", () => {
    const err = new Error(`got 429: ${body("GenerateRequestsPerMinute", "250ms")}`);
    expect(parseQuotaError(err)).toEqual({ daily: false, retryAfterMs: 250 });
  });
  it("falls back to plain text and never invents a delay from other numbers", () => {
    expect(parseQuotaError(new Error("Please retry in 7.2s."))).toEqual({ daily: false, retryAfterMs: 7200 });
    expect(parseQuotaError(new Error("limit 534036052 requests, 20 users"))).toEqual({ daily: false, retryAfterMs: null });
    expect(parseQuotaError(null)).toEqual({ daily: false, retryAfterMs: null });
  });
});

describe("retryWaitMs", () => {
  it("caps the wait and has a default", () => {
    expect(retryWaitMs({ daily: false, retryAfterMs: 22_000 })).toBe(MAX_RETRY_WAIT_MS);
    expect(retryWaitMs({ daily: false, retryAfterMs: 534_036_052_000 })).toBe(MAX_RETRY_WAIT_MS);
    expect(retryWaitMs({ daily: false, retryAfterMs: 2000 })).toBe(2000);
    expect(retryWaitMs({ daily: false, retryAfterMs: null })).toBe(DEFAULT_RETRY_WAIT_MS);
    expect(retryWaitMs({ daily: false, retryAfterMs: 0 })).toBe(1);
  });
});
