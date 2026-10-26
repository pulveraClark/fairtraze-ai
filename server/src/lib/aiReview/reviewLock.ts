// One AI review per group at a time. Separate from the analysis lock on purpose: a review in progress
// must not block an analysis (or the reverse). In memory, per process, like analysisLock.ts.

const running = new Map<number, Promise<void>>();

export function isReviewRunning(projectId: number): boolean {
  return running.has(projectId);
}

// Starts `job` unless a review of this group is already running. Never rejects: failures are logged
// by the job's own handler; the lock is always released.
export function startReview(projectId: number, job: () => Promise<void>): boolean {
  if (running.has(projectId)) return false;
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
