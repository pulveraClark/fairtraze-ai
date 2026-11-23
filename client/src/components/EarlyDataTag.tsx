import { showsEarlyDataTag, type DataConfidence } from "@shared/dataConfidence";
import { InfoTip } from "./ui/InfoTip";
import { FOCUS_LIGHT } from "./ui/styles";
import { TIPS, helpLink } from "../lib/helpText";

/** The tag is always the same two words; the longer sentence lives in the tag's own popover on the instructor report. */
export const EARLY_DATA_TEXT = { medium: "Early data", low: "Early data" } as const;
export const EARLY_DATA_SENTENCE = "Early data: too early to tell. Results may change as work continues.";

const CHIP = "rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium leading-normal text-slate-800";

interface Props {
  level: DataConfidence | null | undefined;
  className?: string;
  /** Instructor summary bar: the tag is a button (with a small ⓘ) that toggles its own popover (no InfoTip). */
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
        aria-label="About early data"
        onClick={popover.onToggle}
        className={`inline-flex min-h-10 items-center gap-1 ${className} ${CHIP} hover:bg-slate-200 ${FOCUS_LIGHT}`}
      >
        {EARLY_DATA_TEXT[level]}
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
        </svg>
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
