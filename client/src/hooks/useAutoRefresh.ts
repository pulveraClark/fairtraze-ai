import { useEffect, useRef, useState } from "react";
import { AUTO_REFRESH_POLL_MAX_MS, AUTO_REFRESH_POLL_MS } from "../lib/analysisFreshness";

interface Options {
  /** One request per key (the group) for as long as the page stays open. */
  key: number | string;
  /** True once the current report is on screen; nothing is asked before that. */
  enabled: boolean;
  /** The shown report's analysis time; a change means the new report has arrived. */
  analyzedAt: string | undefined;
  /** Asks the server; resolves true when it started a background analysis. */
  request: () => Promise<boolean>;
  /** Reads the report again without clearing the page. */
  refetch: () => Promise<unknown>;
  pollMs?: number;
  maxMs?: number;
}

/**
 * Refresh-on-open. Asks once; if the server started an analysis, shows "updating" and re-reads the
 * report every few seconds until it changes, then stops. After maxMs it stops quietly and keeps the
 * current report. It never blocks the page and never shows an error.
 */
export function useAutoRefresh(options: Options): { updating: boolean } {
  const [updating, setUpdating] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const askedFor = useRef<number | string | null>(null);
  const startedFor = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setUpdating(false);
  };

  // Polling lives for as long as the page does (not for one effect run), so React's dev-mode
  // double-invoke of effects cannot cancel the only request this hook makes.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  // The new report arrived: stop at once instead of waiting for the next poll.
  useEffect(() => {
    if (updating && options.analyzedAt !== startedFor.current) stop();
  }, [options.analyzedAt, updating]);

  useEffect(() => {
    if (!options.enabled || askedFor.current === options.key) return;
    askedFor.current = options.key;

    void (async () => {
      const started = await latest.current.request().catch(() => false);
      if (!started || !mounted.current) return;
      startedFor.current = latest.current.analyzedAt;
      const begun = Date.now();
      setUpdating(true);

      const tick = async () => {
        if (!mounted.current) return;
        if (Date.now() - begun >= (latest.current.maxMs ?? AUTO_REFRESH_POLL_MAX_MS)) { stop(); return; }
        try { await latest.current.refetch(); } catch { /* keep the current report */ }
        if (!mounted.current || timer.current === null) return; // stopped meanwhile (new report arrived)
        timer.current = setTimeout(() => void tick(), latest.current.pollMs ?? AUTO_REFRESH_POLL_MS);
      };
      timer.current = setTimeout(() => void tick(), latest.current.pollMs ?? AUTO_REFRESH_POLL_MS);
    })();
  }, [options.enabled, options.key]);

  return { updating };
}
