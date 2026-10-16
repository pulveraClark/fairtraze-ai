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

// The Tasks board: others' moves should show up within ~10 s. The board GET answers 304 when nothing changed.
export const POLL_10S = pollEvery(10_000);
export const POLL_30S = pollEvery(30_000);
export const POLL_60S = pollEvery(60_000);
