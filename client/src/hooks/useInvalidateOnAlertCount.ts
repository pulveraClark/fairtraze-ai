import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { unreadCountQueryOptions } from "./useAlerts";

/**
 * Invalidates the given query-key prefixes whenever the unread-alert count changes, so a page
 * refreshes the data a notification is about without per-query intervals.
 *
 * Observes the same query as the bell (shared options → one request), so it also works on
 * pages where the bell isn't mounted. The first observed value is ignored; only a change
 * after that triggers invalidation. Inactive queries are only marked stale, not refetched.
 *
 * Limitation: the signal is the count, not the alerts. A +1 and −1 inside one poll window nets
 * to no change, and a `collapse` notification that refreshes an existing unread row (e.g.
 * REPORT_READY on a re-analysis) doesn't change it either.
 */
export function useInvalidateOnAlertCount(keys: ReadonlyArray<readonly unknown[]>): void {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { data: count } = useQuery(unreadCountQueryOptions(token, user?.id ?? null));

  const keysRef = useRef(keys);
  keysRef.current = keys;
  const prevCount = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (count === undefined) return;
    if (prevCount.current !== undefined && prevCount.current !== count) {
      for (const queryKey of keysRef.current) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
    prevCount.current = count;
  }, [count, queryClient]);
}
