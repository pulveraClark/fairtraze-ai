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

// A daily call budget so a runaway loop cannot burn the free-tier quota. In memory, per process;
// resets at 00:00 UTC. AI_REVIEW_DAILY_CALL_CAP overrides the default of 600.
let budgetDay = "";
let budgetUsed = 0;

export function dailyCallCap(): number {
  const n = Number(process.env.AI_REVIEW_DAILY_CALL_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 600;
}

export function takeDailyBudget(at: Date = new Date()): boolean {
  const day = at.toISOString().slice(0, 10);
  if (day !== budgetDay) {
    budgetDay = day;
    budgetUsed = 0;
  }
  if (budgetUsed >= dailyCallCap()) return false;
  budgetUsed++;
  return true;
}

export function resetDailyBudgetForTests(): void {
  budgetDay = "";
  budgetUsed = 0;
}
