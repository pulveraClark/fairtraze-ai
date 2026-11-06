import { dataConfidence, isDeadlinePassed, mostActiveMemberDays, type ActiveDaysSource, type DataConfidence } from "@shared/dataConfidence.js";
import { hasNoRecordedActivity } from "./reportActivity.js";

/**
 * Display-only "Early data" level for a stored report, computed at read time and never stored. Used only by the
 * two report read endpoints (instructor report, student group page). Not read by scoring, the analyzer, alerts
 * or exports. `docsApproximate` is already false for GitHub-only groups (`docsDataApproximateFor`). After the project's
 * due date has ended (Manila time) the level is "final" and no tag shows.
 */
export function reportDataConfidence(
  members: ReadonlyArray<ActiveDaysSource & { contributionShare?: number | null }>,
  docsApproximate: boolean,
  deadline: Date | null | undefined = null,
  now: Date = new Date(),
): DataConfidence | null {
  return dataConfidence({
    activeDays: mostActiveMemberDays(members),
    docsApproximate,
    noActivity: hasNoRecordedActivity(members),
    deadlinePassed: isDeadlinePassed(deadline, now),
  });
}
