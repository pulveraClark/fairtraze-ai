// Did a new analysis change what the instructor would act on? "Changed" means the team-health label
// or any member's set of flags differs from the previous report. Scores moving a little do not count:
// automatic runs only raise alerts, and only mark an AI explanation outdated, for changes that matter.

interface ComparableReport {
  teamHealth?: string;
  members?: Array<{ userId?: number; githubUsername?: string; studentName?: string; flags?: string[] }>;
}

function signature(report: ComparableReport): string {
  const members = (report.members ?? [])
    .map((m) => `${m.userId ?? m.githubUsername ?? m.studentName ?? "?"}:${[...(m.flags ?? [])].sort().join("+")}`)
    .sort();
  return `${report.teamHealth ?? ""}|${members.join(",")}`;
}

/** No previous report counts as changed (the first result is new information). */
export function resultsChanged(previous: ComparableReport | null | undefined, next: ComparableReport): boolean {
  if (!previous) return true;
  return signature(previous) !== signature(next);
}

import { narrativeBasisOf } from "./narrativeBasis.js";

export type AnalysisTrigger = "manual" | "auto";

interface PreviousContent {
  report?: ComparableReport;
  narrativeOutdated?: boolean;
  // Which numbers the saved AI explanation was written for (see narrativeBasis.ts), carried to every newer report.
  narrativeBasis?: string;
  narrativeInputHash?: string;
  narrativeAt?: string;
}

/**
 * What a finished analysis does besides saving the report.
 * - notify: a manual run always notifies (as before); an automatic run only when results changed.
 * - contentExtras: stored in Report.content (JSON, no migration): who triggered it, and whether the
 *   carried-forward AI explanation no longer matches the results. Automatic runs never call Gemini.
 *   The explanation is outdated when the numbers it was written for differ from the new report's (any
 *   trigger, any score or Gini movement); an older explanation with no recorded basis falls back to
 *   "label or flags changed". The text itself is never touched.
 */
export function reportPolicy(
  trigger: AnalysisTrigger,
  previous: PreviousContent,
  next: ComparableReport,
  savedNarrative: string | null,
): { notify: boolean; contentExtras: { trigger: AnalysisTrigger; narrativeOutdated?: true; narrativeBasis?: string; narrativeInputHash?: string; narrativeAt?: string } } {
  const changed = resultsChanged(previous.report, next);
  const basisDiffers = previous.narrativeBasis ? previous.narrativeBasis !== narrativeBasisOf(next) : changed;
  const narrativeOutdated = savedNarrative !== null && (previous.narrativeOutdated === true || basisDiffers);
  return {
    notify: trigger === "manual" || changed,
    contentExtras: {
      trigger,
      ...(narrativeOutdated ? { narrativeOutdated: true as const } : {}),
      ...(savedNarrative !== null && previous.narrativeBasis ? { narrativeBasis: previous.narrativeBasis } : {}),
      ...(savedNarrative !== null && previous.narrativeInputHash ? { narrativeInputHash: previous.narrativeInputHash } : {}),
      ...(savedNarrative !== null && previous.narrativeAt ? { narrativeAt: previous.narrativeAt } : {}),
    },
  };
}
