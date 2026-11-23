import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";

/** Small CSS spinner. With reduced motion it is three static dots, so nothing animates. Decoration only. */
export function Spinner({ className = "" }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return (
      <span aria-hidden="true" data-spinner="static" className={`shrink-0 font-bold leading-none tracking-widest ${className}`}>
        •••
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-spinner="spin"
      className={`inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/** Grey placeholder lines. The fixed height keeps the card the same size when the real text arrives. */
export function SkeletonLines({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <div aria-hidden="true" data-skeleton className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`h-3 rounded bg-slate-200 ${reduced ? "" : "animate-pulse"} ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}
