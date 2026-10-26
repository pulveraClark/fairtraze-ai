// One analysis per group at a time, so a manual click, the nightly run and a refresh-on-open
// never analyze the same group together (which would write two reports and double the GitHub calls).
//
// In memory on purpose: the app runs as a single server process (Render). If it is ever scaled to
// several instances this must move to the database.
const running = new Set<number>();

export function tryAcquireAnalysis(projectId: number): boolean {
  if (running.has(projectId)) return false;
  running.add(projectId);
  return true;
}

export function releaseAnalysis(projectId: number): void {
  running.delete(projectId);
}

export function isAnalysisRunning(projectId: number): boolean {
  return running.has(projectId);
}

// Runs fn only if the group is free; returns { ran: false } when another analysis holds it.
// The lock is always released, even when fn throws.
export async function withAnalysisLock<T>(projectId: number, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
  if (!tryAcquireAnalysis(projectId)) return { ran: false };
  try {
    return { ran: true, value: await fn() };
  } finally {
    releaseAnalysis(projectId);
  }
}

export const ANALYSIS_IN_PROGRESS = {
  code: "ANALYSIS_IN_PROGRESS",
  error: "An analysis is already running for this group. Try again in a moment.",
} as const;
