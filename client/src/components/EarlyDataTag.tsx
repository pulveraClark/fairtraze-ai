import { showsEarlyDataTag, type DataConfidence } from "@shared/dataConfidence";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";

export const EARLY_DATA_TEXT = { medium: "Early data", low: "Early data · too early to tell" } as const;

/**
 * Small grey chip shown only when the data should be read with care (low or medium). Display only: no score,
 * flag, Gini value or health label depends on it, and it never prints a day count.
 */
export function EarlyDataTag({ level, className = "" }: { level: DataConfidence | null | undefined; className?: string }) {
  if (!showsEarlyDataTag(level)) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium leading-normal text-slate-800">
        {EARLY_DATA_TEXT[level]}
      </span>
      <InfoTip label="About early data" helpHref={helpLink("flags")}>{TIPS.earlyData}</InfoTip>
    </span>
  );
}
