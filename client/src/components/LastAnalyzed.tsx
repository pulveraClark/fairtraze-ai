import { useEffect, useState } from "react";
import { formatAnalyzedExact, formatLastAnalyzed, formatLastAnalyzedStudent, formatLastAnalyzedUpdateFailed, isAutoAnalysisClosed, UPDATING_TEXT } from "../lib/analysisFreshness";

interface Props {
  analyzedAt: string;
  trigger?: "manual" | "auto" | null;
  updating?: boolean;
  className?: string;
  /** The latest automatic update did not finish (server-decided, read-time). Replaces the "updates automatically" wording. */
  updateFailed?: boolean;
  /** "student": a small grey line, "Last analyzed 14 hours ago. Updates again when there is new activity." */
  variant?: "default" | "student";
  /** Instructor report: the analysis source and repository link, shown after the status wording. */
  analysis?: React.ReactNode;
  /** The assignment deadline (ISO). More than 7 days past it, automatic analysis has stopped and the line says so. */
  deadline?: string | null;
}

/**
 * "Last analyzed 3 hours ago · Re-analyzes when there is new activity" (or "Final report, no
 * more updates" once closed), plus "Updating…" while a background refresh runs. The status span
 * is always in the page so a screen reader announces it when its text appears.
 */
export function LastAnalyzed({ analyzedAt, trigger, updating = false, updateFailed = false, className = "", variant = "default", analysis, deadline }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const closed = isAutoAnalysisClosed(deadline, now);
  return (
    <p className={`${variant === "student" ? "text-xs" : "text-sm"} leading-normal text-slate-700 ${className}`}>
      <span title={formatAnalyzedExact(analyzedAt)}>{updateFailed ? formatLastAnalyzedUpdateFailed(analyzedAt, now) : variant === "student" ? formatLastAnalyzedStudent(analyzedAt, now, closed) : formatLastAnalyzed(analyzedAt, trigger, now, closed)}</span>
      {analysis && <span> · {analysis}</span>}
      <span role="status" aria-live="polite" className="ml-2 font-medium text-indigo-800">
        {updating ? UPDATING_TEXT : ""}
      </span>
    </p>
  );
}
