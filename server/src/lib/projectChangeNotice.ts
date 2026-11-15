import { prisma } from "./prisma.js";
import { buildProjectChangeMessage, maskOf, type ChangeDetail, type ChangeKind } from "./projectChangeText.js";

// Bell notice to the members of every group in a project when the instructor changes it.
// Planning/communication only: nothing here is read by scoring, flags, Gini or team health.

export const PROJECT_CHANGE_WINDOW_MS = 10 * 60 * 1000;
export const PROJECT_CHANGE_REF_TYPE = "ASSIGNMENT_CHANGE";

/**
 * Call AFTER the instructor's write succeeded. Never throws (a notice problem must not fail the save).
 *
 * Recipients are current members of the project's groups only: the user must be active and not
 * erased. Former members have no membership row, pending join requests are a separate table, and the
 * instructor is not a member, so none of them is notified.
 *
 * Saves within PROJECT_CHANGE_WINDOW_MS of the last change to the same group's notice are merged
 * into that notice (the window slides, so one editing session gives one notice). The set of changed
 * things is kept as a bitmask in Alert.refId and the text is always rebuilt from it.
 */
export async function notifyProjectChanged(
  assignmentId: number,
  kinds: ChangeKind[],
  detail: ChangeDetail = {},
): Promise<void> {
  try {
    const mask = maskOf(kinds);
    if (mask === 0) return;

    const groups = await prisma.project.findMany({
      where: { assignmentId },
      select: {
        id: true,
        groupMemberships: {
          where: { user: { active: true, deletedAt: null } },
          select: { userId: true },
        },
      },
    });

    const now = new Date();
    const since = new Date(now.getTime() - PROJECT_CHANGE_WINDOW_MS);

    for (const group of groups) {
      const recipients = [...new Set(group.groupMemberships.map((m) => m.userId))];
      for (const recipientId of recipients) {
        const existing = await prisma.alert.findFirst({
          where: {
            recipientId,
            type: "PROJECT_UPDATED",
            projectId: group.id,
            refType: PROJECT_CHANGE_REF_TYPE,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: "desc" },
        });

        if (existing) {
          const merged = (existing.refId ?? 0) | mask;
          await prisma.alert.update({
            where: { id: existing.id },
            data: {
              refId: merged,
              message: buildProjectChangeMessage(merged, detail, now),
              read: false,
              createdAt: now,
            },
          });
          continue;
        }

        await prisma.alert.create({
          data: {
            recipientId,
            type: "PROJECT_UPDATED",
            message: buildProjectChangeMessage(mask, detail, now),
            link: `/student/group/${group.id}`,
            projectId: group.id,
            refType: PROJECT_CHANGE_REF_TYPE,
            refId: mask,
          },
        });
      }
    }
  } catch (err) {
    console.error("[notify] failed to create project change notice:", err);
  }
}
