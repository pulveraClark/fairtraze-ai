import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

// The student class lists show only the LATEST report of the student's own groups. Prisma's
// `reports: { take: 1 }` (and `distinct`) are applied in the query engine AFTER every report of the
// listed projects was read, large `content` included. This reads exactly one row per project instead,
// with Postgres DISTINCT ON. Ordering is LATEST_REPORT_ORDER (generatedAt desc, id desc), written out
// in SQL; studentClassesCharacterisation.test.ts covers a generatedAt tie.
//
// Values are bound parameters (tagged template), never concatenated. Read-only.

export interface LatestReportRow {
  projectId: number;
  teamHealth: string | null;
  generatedAt: Date;
  content: string | null;
}

/**
 * Latest report of every group the student belongs to, optionally limited to one class.
 * Groups the student is not in are not returned: the lists never show their reports.
 */
export async function latestReportsForStudent(userId: number, classSectionId?: number): Promise<Map<number, LatestReportRow>> {
  const classFilter = classSectionId === undefined ? Prisma.empty : Prisma.sql`AND a."classSectionId" = ${classSectionId}`;
  const rows = await prisma.$queryRaw<LatestReportRow[]>`
    SELECT DISTINCT ON (r."projectId") r."projectId", r."teamHealth", r."generatedAt", r."content"
    FROM "Report" r
    JOIN "Project" p ON p."id" = r."projectId"
    JOIN "Assignment" a ON a."id" = p."assignmentId"
    WHERE EXISTS (SELECT 1 FROM "GroupMembership" gm WHERE gm."projectId" = p."id" AND gm."userId" = ${userId})
    ${classFilter}
    ORDER BY r."projectId", r."generatedAt" DESC, r."id" DESC`;
  return new Map(rows.map((r) => [r.projectId, r]));
}
