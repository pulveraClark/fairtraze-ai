import type { Request } from "express";
import { prisma } from "./prisma.js";

// ── Shared group loader + access helpers ──────────────────────────────────────
// Extracted from routes/groups.ts so the tasks routes (and documents.ts) share one definition.

export async function loadGroup(projectId: number) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      assignment: {
        select: {
          maxGroupSize:  true,
          sourceType:    true,
          classSectionId: true,
          deadline:      true,
          classSection:  { select: { instructorId: true } },
        },
      },
      groupMemberships: {
        include: {
          user: { select: { id: true, name: true, email: true, githubUsername: true, avatarUpdatedAt: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
}

export type LoadedGroup = NonNullable<Awaited<ReturnType<typeof loadGroup>>>;

/** True only for the instructor (or admin) who OWNS the class. A group with no assignment has no owner. */
export function isInstructorOf(req: Request, project: LoadedGroup): boolean {
  return (
    (req.user!.role === "INSTRUCTOR" || req.user!.role === "ADMIN") &&
    project.assignment?.classSection.instructorId === req.user!.sub
  );
}

export function leaderMembership(req: Request, project: LoadedGroup) {
  return project.groupMemberships.find((m) => m.userId === req.user!.sub && m.role === "LEADER");
}

export function canManage(req: Request, project: LoadedGroup): boolean {
  return isInstructorOf(req, project) || !!leaderMembership(req, project);
}
