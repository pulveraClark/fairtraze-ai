import { useEffect, useState } from "react";
import { formatLastAnalyzed, formatLastAnalyzedStudent, UPDATING_TEXT } from "../lib/analysisFreshness";

interface Props {
  analyzedAt: string;
  trigger?: "manual" | "auto" | null;
  updating?: boolean;
  className?: string;
  /** "student": a small grey line, "Last analyzed 14 hours ago. Updates every night." */
  variant?: "default" | "student";
}

/**
 * "Last analyzed 3 hours ago · Updates automatically", plus "Updating…" while a background refresh
 * runs. The status span is always in the page so a screen reader announces it when its text appears.
 */
export function LastAnalyzed({ analyzedAt, trigger, updating = false, className = "", variant = "default" }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className={`${variant === "student" ? "text-xs" : "text-sm"} leading-normal text-slate-700 ${className}`}>
      <span>{variant === "student" ? formatLastAnalyzedStudent(analyzedAt, now) : formatLastAnalyzed(analyzedAt, trigger, now)}</span>
      <span role="status" aria-live="polite" className="ml-2 font-medium text-indigo-800">
        {updating ? UPDATING_TEXT : ""}
      </span>
    </p>
  );
}
