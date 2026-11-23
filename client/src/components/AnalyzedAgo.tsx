import { useEffect, useState } from "react";
import { formatAnalyzedExact, formatLastAnalyzedShort } from "../lib/analysisFreshness";

/**
 * "Last analyzed 3 hours ago" for lists and summary cards (the report pages use LastAnalyzed, which adds the
 * update status). The exact date and time, on the school's Manila clock, is in the tooltip. Re-reads the clock
 * every minute so a card left open does not keep saying "just now".
 */
export function AnalyzedAgo({ iso, className = "" }: { iso: string; className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return <span className={className} title={formatAnalyzedExact(iso)}>{formatLastAnalyzedShort(iso, now)}</span>;
}
