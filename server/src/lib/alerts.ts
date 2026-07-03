import type { AlertType } from "@prisma/client";
import { prisma } from "./prisma.js";
import type { TeamReport } from "@shared/types.js";

/**
 * Called after every analyze run.  Reads the already-computed TeamReport and
 * creates (or refreshes) at-risk alerts for the owning instructor.
 *
 * Rules:
 *  - Only non-healthy groups trigger alerts (Moderate Risk or High Risk).
 *  - MEMBER_FLAGGED fires whenever at least one member carries a flag.
 *  - No-duplicate: if an *unread* alert of the same type already exists for
 *    this project we update it (refresh message + timestamp) instead of
 *    stacking a second one.
 *  - Projects with no linked Assignment are skipped — there is no instructor
 *    to notify.
 */
export async function generateAlertsForProject(
  projectId: number,
  report: TeamReport,
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

  // Build a human-readable label for the group and the class
  const groupLabel = project.groupName.trim() || `Project ${projectId}`;
  const classLabel =
    project.assignmentLabel.trim() ||
    `${assignment.classSection.subjectCode} — ${assignment.classSection.subjectName}`;

  // Determine which alert types apply
  const pending: Array<{ type: AlertType; message: string }> = [];

  if (report.teamHealth === "High Risk") {
    pending.push({
      type: "HIGH_RISK",
      message: `${groupLabel} in ${classLabel} is High Risk (Gini ${report.gini.toFixed(2)})`,
    });
  } else if (report.teamHealth === "Moderate Risk") {
    pending.push({
      type: "MODERATE_RISK",
      message: `${groupLabel} in ${classLabel} is Moderate Risk (Gini ${report.gini.toFixed(2)})`,
    });
  }

  const flaggedCount = report.members.filter((m) => m.flags.length > 0).length;
  if (flaggedCount > 0) {
    pending.push({
      type: "MEMBER_FLAGGED",
      message: `${flaggedCount} member${flaggedCount !== 1 ? "s" : ""} flagged in ${groupLabel}`,
    });
  }

  // Upsert: refresh existing unread alert or create a new one
  for (const { type, message } of pending) {
    const existing = await prisma.alert.findFirst({
      where: { projectId, type, read: false },
    });
    if (existing) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { message, teamHealth: report.teamHealth, createdAt: new Date() },
      });
    } else {
      await prisma.alert.create({
        data: {
          projectId,
          instructorId,
          type,
          message,
          teamHealth: report.teamHealth,
        },
      });
    }
  }
}
