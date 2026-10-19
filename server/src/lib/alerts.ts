import type { AlertType } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { AnyScoredMember, TeamReport } from "@shared/types.js";

/**
 * Called after every analyze run.  Reads the already-computed TeamReport and
 * creates (or refreshes) ONE alert per group for the owning instructor.
 *
 * Rules:
 *  - Risky group (Moderate Risk / High Risk): one MODERATE_RISK / HIGH_RISK alert.
 *  - Healthy group with at least one flagged member: one MEMBER_FLAGGED alert.
 *  - When both apply the alert carries the risk type and a combined message,
 *    e.g. "Group 1: Moderate risk · 1 member flagged".
 *  - No-duplicate: if an *unread* alert of any of these three types already
 *    exists for this project we update the newest in place (type, message,
 *    timestamp) and mark older unread siblings read, instead of stacking more.
 *  - Link goes to that group's Report.
 *  - Projects with no linked Assignment are skipped — there is no instructor
 *    to notify.
 */
export async function generateAlertsForProject(
  projectId: number,
  report: TeamReport<AnyScoredMember>,
  project: {
    groupName: string;
    assignmentLabel: string;
    assignmentId: number | null;
  }
): Promise<void> {
  if (!project.assignmentId) return;

  const assignment = await prisma.assignment.findUnique({
    where: { id: project.assignmentId },
    include: { classSection: true },
  });
  if (!assignment) return;

  const instructorId = assignment.classSection.instructorId;

  const groupLabel = project.groupName.trim() || `Project ${projectId}`;

  const flaggedCount = report.members.filter((m) => m.flags.length > 0).length;
  const flaggedText = flaggedCount > 0 ? `${flaggedCount} member${flaggedCount !== 1 ? "s" : ""} flagged` : "";

  let type: AlertType;
  let message: string;
  if (report.teamHealth === "High Risk" || report.teamHealth === "Moderate Risk") {
    type = report.teamHealth === "High Risk" ? "HIGH_RISK" : "MODERATE_RISK";
    const label = report.teamHealth === "High Risk" ? "High risk" : "Moderate risk";
    message = `${groupLabel}: ${[label, flaggedText].filter(Boolean).join(" · ")}`;
  } else if (flaggedCount > 0) {
    type = "MEMBER_FLAGGED";
    message = `${groupLabel}: ${flaggedText}`;
  } else {
    return;
  }

  const link = `/project/${projectId}?tab=report`;
  const unread = await prisma.alert.findMany({
    where: { projectId, read: false, type: { in: ["HIGH_RISK", "MODERATE_RISK", "MEMBER_FLAGGED"] } },
    orderBy: { createdAt: "desc" },
  });
  const [newest, ...older] = unread;
  if (older.length > 0) {
    await prisma.alert.updateMany({ where: { id: { in: older.map((a) => a.id) } }, data: { read: true } });
  }
  if (newest) {
    await prisma.alert.update({
      where: { id: newest.id },
      data: { type, message, link, teamHealth: report.teamHealth, createdAt: new Date() },
    });
  } else {
    await prisma.alert.create({
      data: { projectId, instructorId, recipientId: instructorId, link, type, message, teamHealth: report.teamHealth },
    });
  }
}
