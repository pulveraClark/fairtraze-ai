import { dataConfidence, mostActiveMemberDays, type ActiveDaysSource, type DataConfidence } from "@shared/dataConfidence.js";
import { hasNoRecordedActivity } from "./reportActivity.js";

/**
 * Display-only "Early data" level for a stored report, computed at read time and never stored. Used only by the
 * two report read endpoints (instructor report, student group page). Not read by scoring, the analyzer, alerts
 * or exports. `docsApproximate` is already false for GitHub-only groups (`docsDataApproximateFor`).
 */
export function reportDataConfidence(
  members: ReadonlyArray<ActiveDaysSource & { contributionShare?: number | null }>,
  docsApproximate: boolean,
): DataConfidence | null {
  return dataConfidence({ activeDays: mostActiveMemberDays(members), docsApproximate, noActivity: hasNoRecordedActivity(members) });
}
