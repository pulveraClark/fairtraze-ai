import { prisma } from "../prisma.js";
import type { AiLastAttempt } from "@shared/aiReviewTypes.js";

// A run that failed must not erase the last good review. When the newest stored review of this kind is
// good (OK or PARTIAL), the failure is noted inside its content (`lastAttempt`, `keptLast`) and nothing
// else changes - not its text, not its date - so the page keeps showing it with a small note.
// Returns false when there is no good review to keep; the caller then stores the failed run as before.
export async function keepLastGood(
  projectId: number,
  kind: "MEMBER_SUMMARIES" | "BRIEF_COMPARISON",
  attempt: AiLastAttempt,
): Promise<boolean> {
  const latest = await prisma.aiReportReview.findFirst({
    where: { kind, report: { projectId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!latest || (latest.status !== "OK" && latest.status !== "PARTIAL")) return false;
  const content = { ...(latest.content as object), lastAttempt: { ...attempt, keptLast: true } };
  await prisma.aiReportReview.update({ where: { id: latest.id }, data: { content } });
  return true;
}
