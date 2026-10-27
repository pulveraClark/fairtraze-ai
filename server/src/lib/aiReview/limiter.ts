// Paces AI review calls so a group's first run does not trip Gemini's free-tier requests-per-minute
// limit: calls start at least `minSpacingMs` apart and at most `concurrency` run at once.

export interface LimiterOptions {
  minSpacingMs: number;
  concurrency: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface Limiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

export function createLimiter(opts: LimiterOptions): Limiter {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const queue: Array<() => Promise<void>> = [];
  let active = 0;
  let nextStart = 0;

  const pump = (): void => {
    while (active < opts.concurrency && queue.length > 0) {
      const job = queue.shift()!;
      active++;
      const startAt = Math.max(now(), nextStart);
      nextStart = startAt + opts.minSpacingMs;
      void (async () => {
        const wait = startAt - now();
        if (wait > 0) await sleep(wait);
        try {
          await job();
        } finally {
          active--;
          pump();
        }
      })();
    }
  };

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(async () => {
          try {
            resolve(await fn());
          } catch (err) {
            reject(err);
          }
        });
        pump();
      });
    },
  };
}

// ~13 requests a minute, two at a time: under the free tier's ~15/min with headroom.
export const aiReviewLimiter = createLimiter({ minSpacingMs: 4500, concurrency: 2 });

// A daily call budget for EVERY provider call (narrative included), so a run is refused up front instead of
// failing halfway. In memory, per process, so it restarts at zero when the server restarts: the provider's
// own "daily limit reached" answer always wins (see noteDailyQuotaHit). The day is the America/Los_Angeles
// day because Google resets the free quota at midnight Pacific.
// AI_DAILY_QUOTA sets the limit (default 20, the free tier); set it higher, e.g. 1000, with a paid key.
// AI_REVIEW_DAILY_CALL_CAP is the older name and is still read when AI_DAILY_QUOTA is not set.
export const DEFAULT_DAILY_QUOTA = 20;
const PACIFIC = "America/Los_Angeles";
const pacificDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" });

export function pacificDay(at: Date): string {
  return pacificDayFormat.format(at);
}

// Milliseconds until the next midnight in Pacific time (exact across daylight-saving changes).
export function msUntilPacificMidnight(at: Date = new Date()): number {
  const today = pacificDay(at);
  let lo = 0; // still today
  let hi = 26 * 3_600_000; // already tomorrow
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (pacificDay(new Date(at.getTime() + mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

let budgetDay = "";
let budgetUsed = 0;
let blockedUntil = 0; // epoch ms; set when the provider itself says the daily limit is reached

export function dailyCallCap(): number {
  for (const raw of [process.env.AI_DAILY_QUOTA, process.env.AI_REVIEW_DAILY_CALL_CAP]) {
    const n = Number(raw);
    if (raw && Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return DEFAULT_DAILY_QUOTA;
}

function rollOver(at: Date): void {
  const day = pacificDay(at);
  if (day !== budgetDay) {
    budgetDay = day;
    budgetUsed = 0;
  }
}

export function remainingCalls(at: Date = new Date()): number {
  rollOver(at);
  return Math.max(0, dailyCallCap() - budgetUsed);
}

export function takeDailyBudget(at: Date = new Date()): boolean {
  rollOver(at);
  if (budgetUsed >= dailyCallCap()) return false;
  budgetUsed++;
  return true;
}

export type QuotaGate = { ok: true } | { ok: false; retryAfterMs: number };

// Can a run that needs `needed` provider calls start now? Not while the provider has said the daily limit is
// reached (until the time it gave), and not when the counter says the day's calls would run out first.
export function quotaGate(needed: number, at: Date = new Date()): QuotaGate {
  if (blockedUntil > at.getTime()) return { ok: false, retryAfterMs: blockedUntil - at.getTime() };
  if (remainingCalls(at) < needed) return { ok: false, retryAfterMs: msUntilPacificMidnight(at) };
  return { ok: true };
}

// The provider said the daily limit is reached: believe it, whatever the counter says, until the time it gave
// (the next Pacific midnight when it gave none).
export function noteDailyQuotaHit(retryAfterMs: number | null, at: Date = new Date()): void {
  blockedUntil = at.getTime() + (retryAfterMs && retryAfterMs > 0 ? retryAfterMs : msUntilPacificMidnight(at));
}

export function resetDailyBudgetForTests(): void {
  budgetDay = "";
  budgetUsed = 0;
  blockedUntil = 0;
}
