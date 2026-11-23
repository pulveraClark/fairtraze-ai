// One AI review per group at a time. Separate from the analysis lock on purpose: a review in progress
// must not block an analysis (or the reverse). In memory, per process, like analysisLock.ts.

const running = new Map<number, Promise<void>>();

// What the last Regenerate did when it made no AI call because nothing changed ("Already up to date").
// In memory like the lock, kept briefly so the page that started the run can say so once it finishes.
const outcomes = new Map<number, { since: string; at: number }>();
export const UP_TO_DATE_NOTICE_MS = 10 * 60 * 1000;

export function recordUpToDate(projectId: number, since: string, now: number = Date.now()): void {
  outcomes.set(projectId, { since, at: now });
}

export function lastUpToDate(projectId: number, now: number = Date.now()): { since: string } | null {
  const o = outcomes.get(projectId);
  if (!o || running.has(projectId) || now - o.at > UP_TO_DATE_NOTICE_MS) return null;
  return { since: o.since };
}

export function isReviewRunning(projectId: number): boolean {
  return running.has(projectId);
}

// Starts `job` unless a review of this group is already running. Never rejects: failures are logged
// by the job's own handler; the lock is always released.
export function startReview(projectId: number, job: () => Promise<void>): boolean {
  if (running.has(projectId)) return false;
  outcomes.delete(projectId);
  const p = job()
    .catch((err) => console.error(`[ai-review] group ${projectId} failed:`, err))
    .finally(() => running.delete(projectId));
  running.set(projectId, p);
  return true;
}

// For tests: resolves when the running review (if any) has finished.
export async function waitForReview(projectId: number): Promise<void> {
  await running.get(projectId);
}
