import { useCallback, useRef, useState } from "react";

/**
 * Stops a double submit. `run(fn)` ignores a call made while an earlier one is still running.
 * The lock is a ref, so it takes effect on the very next click, before React has re-rendered
 * the disabled button. `submitting` drives the disabled state and the "Sending…" label.
 */
export function useSubmitGuard() {
  const locked = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    setSubmitting(true);
    try {
      return await fn();
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submitting, run };
}
