import { prisma } from "../lib/prisma.js";
import { fetchOrderedEvents, replayEditEvents } from "./editReplay.js";

export interface AuthorshipSpan {
  userId: number;
  start: number; // inclusive, flattened plain-text offset
  end: number; // exclusive
}

export interface AuthorshipUser {
  id: number;
  name: string;
}

export interface AuthorshipMap {
  spans: AuthorshipSpan[];
  users: AuthorshipUser[];
}

// Replays a document's full EditEvent log (ordered oldest-first) to determine, for the
// document's CURRENT state, which user's insert last placed each surviving character —
// i.e. the "net-character-authorship map" used for live visualization (Step 3) and later
// reused as an input to document scoring (Step 4, not built here).
//
// Events at the same timestamp (a single diffed edit can produce one DELETE + one INSERT)
// are ordered by `id` as a tiebreaker, relying on the flush code always writing DELETE
// before INSERT within a single createMany call for the same edit.
export async function computeAuthorshipMap(documentId: number): Promise<AuthorshipMap> {
  const events = await fetchOrderedEvents(documentId);
  const { slots } = replayEditEvents(events);

  const spans: AuthorshipSpan[] = [];
  let spanStart = 0;
  let spanUserId: number | undefined;
  for (let i = 0; i <= slots.length; i++) {
    const userId = i < slots.length ? slots[i].userId : undefined;
    if (userId !== spanUserId) {
      if (spanUserId !== undefined) {
        spans.push({ userId: spanUserId, start: spanStart, end: i });
      }
      spanStart = i;
      spanUserId = userId;
    }
  }

  const userIds = Array.from(new Set(spans.map((s) => s.userId)));
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];

  return { spans, users };
}
