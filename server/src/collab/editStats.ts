import { prisma } from "../lib/prisma.js";
import { fetchOrderedEvents, replayEditEvents } from "./editReplay.js";
import { readPresentImages } from "./imageRegistry.js";
import { countEligibleImages } from "@shared/imageCredit.js";
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
      retainedCharsByDay: {},
      weightedRetainedChars: 0,
      importedRetainedChars: 0,
      importedWeightedRetainedChars: 0,
      insertedImageCount: 0,
      countedImageCount: 0,
      editTypeBreakdown: { ...EMPTY_EDIT_TYPE_BREAKDOWN },
    }));
  }

  const events = await fetchOrderedEvents(documentId);
  const { slots, totalInserted, totalDeleted, selfDeleted, editTypeBreakdown } = replayEditEvents(events);

  const retainedChars = new Map<number, number>();
  const weightedRetainedChars = new Map<number, number>();
  const importedRetainedChars = new Map<number, number>();
  const importedWeightedRetainedChars = new Map<number, number>();
  const retainedByDay = new Map<number, Record<string, number>>();
  for (const slot of slots) {
    if (slot.day) {
      const days = retainedByDay.get(slot.userId) ?? {};
      days[slot.day] = (days[slot.day] ?? 0) + 1;
      retainedByDay.set(slot.userId, days);
    }
    retainedChars.set(slot.userId, (retainedChars.get(slot.userId) ?? 0) + 1);
    weightedRetainedChars.set(slot.userId, (weightedRetainedChars.get(slot.userId) ?? 0) + slot.weight);
    if (slot.source === "IMPORT") {
      importedRetainedChars.set(slot.userId, (importedRetainedChars.get(slot.userId) ?? 0) + 1);
      importedWeightedRetainedChars.set(slot.userId, (importedWeightedRetainedChars.get(slot.userId) ?? 0) + slot.weight);
    }
  }

  const sessions = await prisma.editSession.findMany({ where: { documentId } });
  const sessionsByUser = new Map<number, { count: number; liveCount: number; dates: string[]; imageInsertCount: number }>();
  // Gross images inserted (display) still comes from every session, image-only ones included.
  const grossImages = new Map<number, number>();
  for (const s of sessions) grossImages.set(s.userId, (grossImages.get(s.userId) ?? 0) + s.imageInsertCount);

  // Images still in the saved document, once per content, big enough (shared/imageCredit.ts). The
  // project's image limit is applied by computeDocumentTeamReport.
  const eligibleImages = countEligibleImages(await readPresentImages(documentId));

  for (const s of sessions) {
    // Images earn credit through the retained-text term only. A session made only of image inserts
    // (no typed characters) is not a writing session, so it adds no session credit and no session
    // date: nobody can add sessions by inserting an image after each idle gap.
    if (s.characterCount === 0 && s.imageInsertCount > 0) continue;
    const entry = sessionsByUser.get(s.userId) ?? { count: 0, liveCount: 0, dates: [], imageInsertCount: 0 };
    entry.count += 1;
    if (s.source === "LIVE") entry.liveCount += 1;
    entry.dates.push(s.startedAt.toISOString());
    sessionsByUser.set(s.userId, entry);
  }

  return roster.map((r) => {
    const sess = sessionsByUser.get(r.userId) ?? { count: 0, liveCount: 0, dates: [], imageInsertCount: 0 };
    return {
      studentName: r.studentName,
      userId: r.userId,
      githubUsername: r.githubUsername,
      retainedChars: retainedChars.get(r.userId) ?? 0,
      totalInsertedChars: totalInserted.get(r.userId) ?? 0,
      totalDeletedChars: totalDeleted.get(r.userId) ?? 0,
      selfDeletedChars: selfDeleted.get(r.userId) ?? 0,
      weightedRetainedChars: weightedRetainedChars.get(r.userId) ?? 0,
      importedRetainedChars: importedRetainedChars.get(r.userId) ?? 0,
      importedWeightedRetainedChars: importedWeightedRetainedChars.get(r.userId) ?? 0,
      insertedImageCount: grossImages.get(r.userId) ?? 0,
      countedImageCount: eligibleImages.get(r.userId) ?? 0,
      editTypeBreakdown: editTypeBreakdown.get(r.userId) ?? { ...EMPTY_EDIT_TYPE_BREAKDOWN },
      sessionCount: sess.count,
      liveSessionCount: sess.liveCount,
      sessionDates: sess.dates,
      retainedCharsByDay: retainedByDay.get(r.userId) ?? {},
    };
  });
}
