import { showsEarlyDataTag, type DataConfidence } from "@shared/dataConfidence";
import { InfoTip } from "./ui/InfoTip";
import { FOCUS_LIGHT } from "./ui/styles";
import { TIPS, helpLink } from "../lib/helpText";

/** The tag is always the same two words; the longer sentence lives in the instructor's Gini popover. */
export const EARLY_DATA_TEXT = { medium: "Early data", low: "Early data" } as const;
export const EARLY_DATA_SENTENCE = "Early data: too early to tell. Results may change as work continues.";

const CHIP = "rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium leading-normal text-slate-800";

interface Props {
  level: DataConfidence | null | undefined;
  className?: string;
  /** Instructor summary bar: the tag is a button that toggles the same popover as the Gini (i) (no own tip). */
  popover?: { expanded: boolean; controls?: string; onToggle: () => void; buttonRef?: React.Ref<HTMLButtonElement> };
}

/**
 * Small grey chip shown only when the data should be read with care (low or medium). Display only: no score,
 * flag, Gini value or health label depends on it, and it never prints a day count.
 */
export function EarlyDataTag({ level, className = "", popover }: Props) {
  if (!showsEarlyDataTag(level)) return null;
  if (popover) {
    return (
      <button
        type="button"
        ref={popover.buttonRef}
        aria-expanded={popover.expanded}
        aria-controls={popover.controls}
        aria-label="Early data. About team health and early data"
        onClick={popover.onToggle}
        className={`inline-flex min-h-9 items-center ${className} ${CHIP} hover:bg-slate-200 ${FOCUS_LIGHT}`}
      >
        {EARLY_DATA_TEXT[level]}
      </button>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className={CHIP}>{EARLY_DATA_TEXT[level]}</span>
      <InfoTip label="About early data" helpHref={helpLink("flags")}>{TIPS.earlyData}</InfoTip>
    </span>
  );
}
