import { createHash } from "node:crypto";
import { prisma } from "../prisma.js";

// "Nothing changed since the last good run" costs zero AI calls. A fingerprint is a hash of the exact
// inputs a run would send (commit shas, Docs text, the instructions and attachments, prompt versions, the
// model name). It is computed from reads only (GitHub, the database), before any provider call.

export type ReviewKind = "MEMBER_SUMMARIES" | "BRIEF_COMPARISON";

export function inputFingerprint(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export interface ReusableReview {
  id: number;
  reportId: number;
  createdAt: Date;
  content: Record<string, unknown>;
}

// The newest stored review of this kind, only if it can be reused: a clean OK run. A failed, partial or
// skipped last run, or one that carries a failed-refresh note, is never "unchanged".
export async function findReusableReview(projectId: number, kind: ReviewKind): Promise<(ReusableReview & { inputHash: string | null }) | null> {
  const latest = await prisma.aiReportReview.findFirst({
    where: { kind, report: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!latest || latest.status !== "OK") return null;
  const content = latest.content as Record<string, unknown>;
  if (content.lastAttempt) return null;
  return {
    id: latest.id,
    reportId: latest.reportId,
    createdAt: latest.createdAt,
    content,
    inputHash: typeof content.inputHash === "string" ? content.inputHash : null,
  };
}

// The reused review now belongs to the group's newest report, so it reads as current. Its text and its
// date stay as they were; a stale row of the same kind on that report is replaced.
export async function adoptReviewForReport(rowId: number, kind: ReviewKind, reportId: number): Promise<void> {
  await prisma.aiReportReview.deleteMany({ where: { reportId, kind, id: { not: rowId } } });
  await prisma.aiReportReview.update({ where: { id: rowId }, data: { reportId } });
}
