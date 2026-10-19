import { noActivityRollupText } from "../lib/groupActivity";

/** Its own neutral line in a roll-up for groups with no activity yet; never styled or counted as risk. */
export function NoActivityRollup({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <p className={`text-xs text-slate-600 ${className}`}>{noActivityRollupText(count)}</p>;
}

/**
 * The page-header version: a grey pill with a dot, the same shape and size as the "need attention" pill beside it
 * (px-2.5 py-1, rounded-full, border, text-xs semibold), so the two read as siblings. Grey, never a risk colour;
 * text-slate-700 on slate-100 is about 9:1.
 */
export function NoActivityHeaderPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-300 bg-slate-100 text-xs font-semibold text-slate-700">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      {noActivityRollupText(count)}
    </span>
  );
}
