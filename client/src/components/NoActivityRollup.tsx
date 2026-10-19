import { noActivityRollupText } from "../lib/groupActivity";

/** Its own neutral line in a roll-up for groups with no activity yet; never styled or counted as risk. */
export function NoActivityRollup({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return <p className={`text-xs text-slate-600 ${className}`}>{noActivityRollupText(count)}</p>;
}
