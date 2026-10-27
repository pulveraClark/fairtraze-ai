import { AiReviewError, type AiErrorCode } from "./geminiClient.js";
import type { AiLastAttempt } from "@shared/aiReviewTypes.js";

// Plain-language wording for AI failures. Raw provider text never reaches a user: only these sentences.
// For a daily quota the client words the reset time in the viewer's own clock from `retryAt`; the hours
// form below is the fallback for places that cannot (the narrative's `error` string).

export const NARRATIVE_UNAVAILABLE_TEXT = "AI explanation temporarily unavailable — showing computed results.";

export function plainAiFailure(code: string | null | undefined, retryAfterMs?: number | null): string {
  switch (code) {
    case "AI_QUOTA_DAILY":
      return typeof retryAfterMs === "number" && retryAfterMs > 0
        ? `The AI's daily limit was reached. It resets in about ${Math.max(1, Math.ceil(retryAfterMs / 3_600_000))} ${Math.ceil(retryAfterMs / 3_600_000) <= 1 ? "hour" : "hours"}. Try again later.`
        : "The AI's daily limit was reached. Try again later.";
    default:
      return NARRATIVE_UNAVAILABLE_TEXT;
  }
}

export function aiFailureOf(err: unknown): { code: AiErrorCode; retryAfterMs: number | null } {
  return err instanceof AiReviewError
    ? { code: err.code, retryAfterMs: err.retryAfterMs }
    : { code: "AI_UNAVAILABLE", retryAfterMs: null };
}

// The daily limit is still in force when a stored attempt hit it and its reset time has not passed.
// With no known reset time it stays "reached" (the page words it without a time). Null when none applies.
export function activeQuotaLimit(
  attempts: Array<AiLastAttempt | undefined>,
  now: Date = new Date(),
): { retryAt: string | null } | null {
  let found = false;
  let latest: string | null = null;
  for (const a of attempts) {
    if (a?.errorCode !== "AI_QUOTA_DAILY") continue;
    if (a.retryAt && Date.parse(a.retryAt) <= now.getTime()) continue;
    found = true;
    if (a.retryAt && (!latest || a.retryAt > latest)) latest = a.retryAt;
  }
  return found ? { retryAt: latest } : null;
}

// The note stored with a review that did not fully succeed (and, later, kept on the last good one).
export function attemptNote(
  result: { status: string; errorCode: string | null; retryAfterMs?: number | null },
  now: Date = new Date(),
): AiLastAttempt | undefined {
  if (result.status !== "FAILED" && result.status !== "PARTIAL") return undefined;
  // A failed run always leaves a note, so it can never silently replace a good review.
  const errorCode = result.errorCode ?? (result.status === "FAILED" ? "AI_UNAVAILABLE" : null);
  if (!errorCode) return undefined;
  const wait = errorCode === "AI_QUOTA_DAILY" ? result.retryAfterMs : null;
  return {
    at: now.toISOString(),
    errorCode,
    ...(typeof wait === "number" && wait > 0 ? { retryAt: new Date(now.getTime() + wait).toISOString() } : {}),
  };
}
