import { prisma } from "../lib/prisma.js";
import { fetchOrderedEvents, replayEditEvents } from "./editReplay.js";
import type { RawDocumentMemberStats } from "@shared/types.js";

const EMPTY_EDIT_TYPE_BREAKDOWN = { substantive: 0, revision: 0, formatting: 0, trivial: 0 };

export interface RosterMember {
  userId: number;
  studentName: string;
  githubUsername: string;
}

// documentId === null → project has no Document row yet (editor never opened); return
// all-zero stats for the roster so a report can still be produced (mirrors the GitHub
// path's zero-commit case).
export async function computeDocumentRawStats(
  documentId: number | null,
  roster: RosterMember[]
): Promise<RawDocumentMemberStats[]> {
  if (documentId === null) {
    return roster.map((r) => ({
      studentName: r.studentName,
      userId: r.userId,
      githubUsername: r.githubUsername,
      retainedChars: 0,
      totalInsertedChars: 0,
      totalDeletedChars: 0,
      selfDeletedChars: 0,
      sessionCount: 0,
      sessionDates: [],
      weightedRetainedChars: 0,
      editTypeBreakdown: { ...EMPTY_EDIT_TYPE_BREAKDOWN },
    }));
  }

  const events = await fetchOrderedEvents(documentId);
  const { slots, totalInserted, totalDeleted, selfDeleted, editTypeBreakdown } = replayEditEvents(events);

  const retainedChars = new Map<number, number>();
  const weightedRetainedChars = new Map<number, number>();
  for (const slot of slots) {
    retainedChars.set(slot.userId, (retainedChars.get(slot.userId) ?? 0) + 1);
    weightedRetainedChars.set(slot.userId, (weightedRetainedChars.get(slot.userId) ?? 0) + slot.weight);
  }

  const sessions = await prisma.editSession.findMany({ where: { documentId } });
  const sessionsByUser = new Map<number, { count: number; dates: string[] }>();
  for (const s of sessions) {
    const entry = sessionsByUser.get(s.userId) ?? { count: 0, dates: [] };
    entry.count += 1;
    entry.dates.push(s.startedAt.toISOString());
    sessionsByUser.set(s.userId, entry);
  }

  return roster.map((r) => {
    const sess = sessionsByUser.get(r.userId) ?? { count: 0, dates: [] };
    return {
      studentName: r.studentName,
      userId: r.userId,
      githubUsername: r.githubUsername,
      retainedChars: retainedChars.get(r.userId) ?? 0,
      totalInsertedChars: totalInserted.get(r.userId) ?? 0,
      totalDeletedChars: totalDeleted.get(r.userId) ?? 0,
      selfDeletedChars: selfDeleted.get(r.userId) ?? 0,
      weightedRetainedChars: weightedRetainedChars.get(r.userId) ?? 0,
      editTypeBreakdown: editTypeBreakdown.get(r.userId) ?? { ...EMPTY_EDIT_TYPE_BREAKDOWN },
      sessionCount: sess.count,
      sessionDates: sess.dates,
    };
  });
}
