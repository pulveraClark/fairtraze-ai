import { useSlowAfter } from "../../hooks/useSlowAfter";
import { SLOW_AFTER_MS, SLOW_TEXT } from "../../lib/feedback";
import { Spinner } from "./Spinner";

/**
 * Calm "waiting for the server" state for a page or panel. Keep it in the same place the content will
 * appear; `className` can reserve height (e.g. "min-h-32") so nothing jumps when the data arrives.
 * After about 3 seconds it adds the shared "taking longer" line.
 */
export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  const slow = useSlowAfter(true, SLOW_AFTER_MS);
  return (
    <div role="status" className={`flex flex-col items-start gap-1 text-sm text-slate-700 ${className}`}>
      <span className="inline-flex items-center gap-2">
        <Spinner />
        {label}
      </span>
      {slow && <span>{SLOW_TEXT}</span>}
    </div>
  );
}

/** The "taking longer" line for a form or dialog whose submit button is busy (`slow` from useAction). */
export function SlowNote({ show }: { show: boolean }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-slate-700">
      {show ? SLOW_TEXT : ""}
    </p>
  );
}
