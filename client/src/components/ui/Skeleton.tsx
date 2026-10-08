import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";

/** Placeholder block. Pulses only when the user hasn't asked for reduced motion. */
export function Skeleton({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return <div aria-hidden="true" data-testid="skeleton" className={`rounded-lg bg-slate-200 ${reduced ? "" : "animate-pulse"} ${className}`} />;
}
