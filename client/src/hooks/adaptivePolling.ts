import { useEffect } from "react";
import { useQueryClient, type Query, type QueryKey } from "@tanstack/react-query";

/**
 * Polling that slows down while nothing changes and snaps back when something might have.
 *
 * - After every `UNCHANGED_POLLS_PER_STEP` polls that returned the same data the interval doubles, up to
 *   `max` (10 s -> 20 s -> 30 s for the task board and the task details window).
 * - It goes back to `base` on window focus / the tab becoming visible, on the user's own write (a
 *   write invalidates the query, or sets its data by hand), and on any changed response.
 * - Hidden tabs are not polled at all (`refetchIntervalInBackground: false`), as before.
 *
 * Display only: it changes how often the same GET is repeated, never what it returns.
 */
export const UNCHANGED_POLLS_PER_STEP = 3;

/** The interval after `unchanged` identical polls in a row: base, doubled once per step, never above max. */
export function adaptiveInterval(base: number, max: number, unchanged: number): number {
  const steps = Math.floor(Math.max(0, unchanged) / UNCHANGED_POLLS_PER_STEP);
  return Math.min(max, base * 2 ** steps);
}

interface PollState {
  /** Query.state.dataUpdateCount last seen; a different value means a fetch finished since. */
  lastCount: number;
  lastData: unknown;
  unchanged: number;
  /** Matches `resetEpoch` when this state is current; an older value means a focus happened. */
  epoch: number;
}

// The callback must accept the query of any data type, or useQuery cannot infer its own data type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = Query<any, any, any, any>;
const states = new WeakMap<AnyQuery, PollState>();
let resetEpoch = 0;

/** Back to the base interval for every adaptive query (window focus, tab visible). */
export function resetAdaptivePolling(): void {
  resetEpoch += 1;
}

let listening = false;
function listenForFocus(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("focus", resetAdaptivePolling);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resetAdaptivePolling();
  });
}

/**
 * Reads the query's own state: a finished fetch whose data is the same object as before (React Query's
 * structural sharing keeps the object when nothing changed) counts as unchanged; anything else resets.
 * Safe to call any number of times between fetches.
 */
export function nextPollInterval(query: AnyQuery, base: number, max: number): number {
  let s = states.get(query);
  if (!s) {
    s = { lastCount: 0, lastData: undefined, unchanged: 0, epoch: resetEpoch };
    states.set(query, s);
  }
  if (s.epoch !== resetEpoch) {
    s.epoch = resetEpoch;
    s.unchanged = 0;
  }
  const count = query.state.dataUpdateCount;
  if (count !== s.lastCount) {
    s.unchanged = s.lastCount !== 0 && query.state.data === s.lastData ? s.unchanged + 1 : 0;
    s.lastCount = count;
    s.lastData = query.state.data;
  }
  return adaptiveInterval(base, max, s.unchanged);
}

/**
 * Spread into `useQuery` in place of a fixed `pollEvery(base)`. Needs the query key so the user's own
 * writes (invalidate / setQueryData) can reset the interval at once.
 */
export function useAdaptivePolling(queryKey: QueryKey, base: number, max: number) {
  const queryClient = useQueryClient();
  const keyHash = JSON.stringify(queryKey);
  useEffect(() => {
    listenForFocus();
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== keyHash) return;
      const a = event.action;
      const own = a.type === "invalidate" || (a.type === "success" && a.manual === true);
      if (!own) return;
      const s = states.get(event.query);
      if (s) s.unchanged = 0;
    });
  }, [queryClient, keyHash]);

  return {
    refetchInterval: (query: AnyQuery) => nextPollInterval(query, base, max),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: Math.floor(base / 2),
  } as const;
}
