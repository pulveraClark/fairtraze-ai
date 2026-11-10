import { useEffect, useId, useRef, useState } from "react";
import type { TeamHealth } from "@shared/types";
import type { DataConfidence } from "@shared/dataConfidence";
import { showsEarlyDataTag } from "@shared/dataConfidence";
import { CARD, FOCUS_LIGHT } from "../ui/styles";
import { StatusPill } from "../ui/StatusPill";
import { NoActivityPill } from "../NoActivityPill";
import { EarlyDataTag, EARLY_DATA_SENTENCE } from "../EarlyDataTag";
import { helpLink } from "../../lib/helpText";

interface Props {
  noActivity: boolean;
  teamHealth: TeamHealth;
  gini: number;
  /** Low early-data level: the health pill is grey. */
  earlyMuted: boolean;
  confidence: DataConfidence | null;
  flaggedCount: number;
  /** Average Gini of the other groups in this assignment, or null. */
  averageGini: number | null;
}

export const flaggedText = (n: number) => `${n} member${n === 1 ? "" : "s"} flagged`;

/**
 * The one summary container of the instructor report: Team health, the early-data tag, the Gini value and how many
 * members are flagged. The tag and the Gini (i) are real buttons that toggle the same popover. Display only.
 */
export function TeamSummaryBar({ noActivity, teamHealth, gini, earlyMuted, confidence, flaggedCount, averageGini }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLButtonElement>(null);
  const tagRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<React.RefObject<HTMLButtonElement | null>>(infoRef);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      lastTrigger.current.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const toggle = (from: React.RefObject<HTMLButtonElement | null>) => { lastTrigger.current = from; setOpen((v) => !v); };
  const early = !noActivity && showsEarlyDataTag(confidence);

  return (
    <section aria-label="Summary" className={`${CARD} px-4 py-3`}>
      <div ref={rootRef} className="relative flex flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-normal text-slate-900">
        <span className="font-semibold">Team health</span>
        {noActivity ? <NoActivityPill /> : <StatusPill kind="health" value={teamHealth} muted={earlyMuted} />}
        {early && (
          <EarlyDataTag level={confidence} popover={{ expanded: open, controls: open ? id : undefined, onToggle: () => toggle(tagRef), buttonRef: tagRef }} />
        )}
        {noActivity ? (
          <span className="text-slate-700">Scores appear once members have recorded activity.</span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 tabular-nums">
              Gini {gini.toFixed(3)}
              <button
                type="button"
                ref={infoRef}
                aria-label="About the Gini coefficient and team health"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                onClick={() => toggle(infoRef)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-slate-900/10 ${FOCUS_LIGHT}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
                </svg>
              </button>
            </span>
            <span>{flaggedText(flaggedCount)}</span>
          </>
        )}
        {open && (
          <div
            id={id}
            role="group"
            aria-label="About the Gini coefficient and team health"
            className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-300 bg-white p-3 text-lg font-normal leading-normal text-slate-800 shadow-lg"
          >
            <p>Gini shows how evenly the work is shared. 0 means perfectly equal.</p>
            {early && <p className="mt-2">{EARLY_DATA_SENTENCE}</p>}
            {averageGini !== null && (
              <p className="mt-2">
                Average for other groups in this assignment: {averageGini.toFixed(3)} —{" "}
                {gini > averageGini ? "this group is more uneven" : gini < averageGini ? "this group is more even" : "equal"}.
              </p>
            )}
            <a href={helpLink("gini")} target="_blank" rel="noopener noreferrer" className={`mt-2 block w-fit rounded font-semibold text-indigo-700 underline ${FOCUS_LIGHT}`}>
              More in Help
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
