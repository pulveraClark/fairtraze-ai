// Reads a provider "too many requests" error: is it a per-day quota (never worth retrying) and how long
// does the provider say to wait. Gemini puts a Google RPC body in the error: details[] with a RetryInfo
// ("retryDelay": "14309s") and a QuotaFailure (violations[].quotaId, e.g. "...PerDayPerProject...").

export const DEFAULT_RETRY_WAIT_MS = 5_000;
export const MAX_RETRY_WAIT_MS = 20_000;

export interface QuotaInfo {
  // The provider says a per-day limit was hit: retrying cannot succeed before the reset.
  daily: boolean;
  // What the provider asked for, uncapped; null when it gave no usable delay.
  retryAfterMs: number | null;
}

// "14309s", "1.5s", "250ms" (also a bare number of seconds). Anything else is null.
export function parseDelayMs(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 1000) : null;
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2]?.toLowerCase() === "ms" ? n : n * 1000);
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

function parseJsonBody(message: string): Json | null {
  for (const candidate of [message, message.slice(message.indexOf("{"))]) {
    try {
      const v: unknown = JSON.parse(candidate);
      if (isObj(v)) return v;
    } catch {
      // not JSON; try the next form
    }
  }
  return null;
}

function detailsOf(body: unknown): Json[] {
  if (!isObj(body)) return [];
  const direct = Array.isArray(body.details) ? body.details : [];
  const nested = isObj(body.error) && Array.isArray(body.error.details) ? body.error.details : [];
  return [...direct, ...nested].filter(isObj);
}

export function parseQuotaError(err: unknown): QuotaInfo {
  const e = isObj(err) ? err : {};
  const message = typeof e.message === "string" ? e.message : "";
  const bodies: unknown[] = [e, e.error, message ? parseJsonBody(message) : null];
  const details = bodies.flatMap(detailsOf);

  let daily = false;
  let retryAfterMs: number | null = null;
  for (const d of details) {
    const type = String(d["@type"] ?? "");
    if (type.endsWith("RetryInfo") && retryAfterMs === null) retryAfterMs = parseDelayMs(d.retryDelay);
    if (type.endsWith("QuotaFailure") && Array.isArray(d.violations)) {
      for (const v of d.violations) if (isObj(v) && /PerDay/i.test(String(v.quotaId ?? ""))) daily = true;
    }
  }

  // Text fallbacks for errors whose body was not structured.
  if (!daily && /PerDay|per day/i.test(message)) daily = true;
  if (retryAfterMs === null) {
    const m = message.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?(?:ms|s)?)/i) ?? message.match(/retry in (\d+(?:\.\d+)?\s*(?:ms|s))\b/i);
    retryAfterMs = m ? parseDelayMs(m[1]) : null;
  }
  return { daily, retryAfterMs };
}

// How long to wait before the single retry of a per-minute limit: what the provider asked for, capped.
export function retryWaitMs(info: QuotaInfo): number {
  const ask = info.retryAfterMs ?? DEFAULT_RETRY_WAIT_MS;
  return Math.max(1, Math.min(ask, MAX_RETRY_WAIT_MS));
}
