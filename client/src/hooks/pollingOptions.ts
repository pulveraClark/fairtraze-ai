/**
 * Opt-in polling for queries that show data other users change. Applied per query
 * (spread into `useQuery`), never as a global default, so un-polled pages are unchanged.
 *
 * - refetchIntervalInBackground is false so hidden tabs stop polling (Neon compute).
 * - refetchOnWindowFocus is true here because the global default (main.tsx) is false.
 * - staleTime is set below the interval so a focus refetch actually fires after a pause.
 */
function pollEvery(ms: number) {
  return {
    refetchInterval:             ms,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus:        true,
    staleTime:                   Math.floor(ms / 2),
  } as const;
}

// The Tasks board and the task details window: others' changes show up within ~10 s while things are
// moving. The GET answers 304 when nothing changed, and after 3 unchanged polls the interval doubles
// (10 s -> 20 s -> 30 s), see adaptivePolling.ts. Focus, the user's own write or a changed response go back to 10 s.
export const TASK_POLL_BASE_MS = 10_000;
export const TASK_POLL_MAX_MS = 30_000;
export const POLL_10S = pollEvery(10_000);
export const POLL_30S = pollEvery(30_000);
export const POLL_60S = pollEvery(60_000);
