import { prisma } from "./prisma.js";
import { getAuthorshipFixAt } from "./authorshipFix.js";
import { analysisDayOf } from "@shared/analysisDay.js";
import { ONE_GO_MIN_CHARS, oneGoHintApplies } from "@shared/oneGoHint.js";
import type { AnyScoredMember } from "@shared/types.js";

/** The member's retained Docs characters in the stored report (EDITOR members are flat, COMBINED nest `.document`). */
function retainedOf(m: AnyScoredMember): { userId: number; retained: number } | null {
  if ("document" in m) return m.document && "userId" in m ? { userId: (m as { userId: number }).userId, retained: m.document.retainedChars } : null;
  if ("userId" in m && "retainedChars" in m) return { userId: m.userId, retained: m.retainedChars };
  return null;
}

/**
 * Instructor-only hint, computed at read time from the edit log and never stored: members whose
 * largest single LIVE insert (>= ONE_GO_MIN_CHARS) is a large part of their retained text. Plain
 * counting; no AI. Only events after the authorship fix and not newer than the report are read, so
 * the hint matches the numbers on the report. Display only: nothing here reaches scoring, flags,
 * Gini, team health, a student DTO, an export or an AI prompt.
 */
export async function computeDocsOneGo(
  documentId: number | null | undefined,
  members: readonly AnyScoredMember[],
  reportGeneratedAt: Date
): Promise<{ userId: number; day: string }[]> {
  if (documentId == null) return [];
  const retained = new Map<number, number>();
  for (const m of members) {
    const r = retainedOf(m);
    if (r) retained.set(r.userId, r.retained);
  }
  if (retained.size === 0) return [];

  // Only big inserts are read (a handful of rows), so this is one small indexed query.
  const big = await prisma.editEvent.findMany({
    where: {
      documentId,
      eventType: "INSERT",
      source: "LIVE",
      length: { gte: ONE_GO_MIN_CHARS },
      userId: { in: [...retained.keys()] },
      timestamp: { gte: getAuthorshipFixAt(), lte: reportGeneratedAt },
    },
    select: { userId: true, length: true, timestamp: true },
  });

  const largest = new Map<number, { length: number; timestamp: Date }>();
  for (const e of big) {
    const cur = largest.get(e.userId);
    if (!cur || e.length > cur.length) largest.set(e.userId, { length: e.length, timestamp: e.timestamp });
  }

  const out: { userId: number; day: string }[] = [];
  for (const [userId, ins] of largest) {
    const day = analysisDayOf(ins.timestamp);
    if (day && oneGoHintApplies(ins.length, retained.get(userId) ?? 0)) out.push({ userId, day });
  }
  return out.sort((a, b) => a.userId - b.userId);
}
