import { prisma } from "../lib/prisma.js";
import type { EditEvent, EditType as PrismaEditType, EditSource } from "@prisma/client";
import { EDIT_TYPE_WEIGHT } from "@shared/editClassifier.js";
import type { EditType } from "@shared/editClassifier.js";
import { analysisDayOf } from "@shared/analysisDay.js";

// Maps the Prisma (uppercase) enum back to the shared (lowercase) key used by EDIT_TYPE_WEIGHT.
const PRISMA_TO_EDIT_TYPE: Record<PrismaEditType, EditType> = {
  SUBSTANTIVE: "substantive",
  REVISION:    "revision",
  FORMATTING:  "formatting",
  TRIVIAL:     "trivial",
};

export type EditTypeBreakdown = Record<EditType, number>;

function emptyBreakdown(): EditTypeBreakdown {
  return { substantive: 0, revision: 0, formatting: 0, trivial: 0 };
}

export interface SlotInfo {
  userId: number;
  weight: number; // EDIT_TYPE_WEIGHT of the INSERT event that placed this character; 1.0 if unclassified
  source: EditSource; // "LIVE" | "IMPORT" — which pipeline produced the INSERT that placed this character
  day: string; // Asia/Manila calendar day (YYYY-MM-DD) of the INSERT that placed this character
}

export interface ReplayResult {
  slots: SlotInfo[]; // slots[i] = who currently owns char i, and the significance weight it carries
  totalInserted: Map<number, number>;
  totalDeleted: Map<number, number>;
  selfDeleted: Map<number, number>; // subset of totalDeleted: same user who inserted also deleted
  editTypeBreakdown: Map<number, EditTypeBreakdown>; // per-user counts of classified INSERT events
  restoredChars: Map<number, number>; // per inserter: characters handed back to their original owners
  restoredByEvent: Map<number, number>; // INSERT event id -> characters of it that were handed back
}

// Ownership return. When user X removes text that belonged to someone else and then inserts exactly
// that text again (Ctrl+Z, or cutting and pasting it elsewhere), the characters go back to the people
// who wrote them; they are not credited to X as new writing. Plain counting on the edit log, no AI.
//  - exact text match only (an edited paste-back, or a copy that was never deleted, is new text)
//  - only text of RESTORE_MIN_CHARS or more, and only within RESTORE_WINDOW_MS of the removal
//  - a removal is used up by the first matching insert
//  - only characters that belonged to someone else go back; X's own characters in it stay X's
//  - per acting user, at most RESTORE_MAX_REMEMBERED_PER_USER removals are remembered; at the cap the
//    oldest is forgotten, and a later insert of its text is simply counted as new text (the old rule)
export const RESTORE_MIN_CHARS = 20;
export const RESTORE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RESTORE_MAX_REMEMBERED_PER_USER = 200;

interface RememberedRemoval {
  slots: SlotInfo[]; // the removed characters, with their owners at the time
  at: number; // epoch ms of the removal
}

// Events at the same timestamp (a single diffed edit can produce one DELETE + one INSERT)
// are ordered by `id` as a tiebreaker, relying on the flush code always writing DELETE
// before INSERT within a single createMany call for the same edit.
export async function fetchOrderedEvents(documentId: number): Promise<EditEvent[]> {
  return prisma.editEvent.findMany({
    where: { documentId },
    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
  });
}

function bump(map: Map<number, number>, id: number, n: number) {
  map.set(id, (map.get(id) ?? 0) + n);
}

// Single source of truth for the INSERT/DELETE slot replay — used by computeAuthorshipMap
// (Step 3, unchanged behavior) and computeDocumentRawStats (Step 4, self-churn aware).
export function replayEditEvents(events: EditEvent[]): ReplayResult {
  const slots: SlotInfo[] = [];
  const totalInserted = new Map<number, number>();
  const totalDeleted = new Map<number, number>();
  const selfDeleted = new Map<number, number>();
  const editTypeBreakdown = new Map<number, EditTypeBreakdown>();
  const restoredChars = new Map<number, number>();
  const restoredByEvent = new Map<number, number>();
  // acting user -> removed text -> the removal (a Map keeps insertion order, so the oldest is first)
  const remembered = new Map<number, Map<string, RememberedRemoval>>();

  for (const event of events) {
    const at = event.timestamp.getTime();
    if (event.eventType === "INSERT") {
      const editType = event.editType ? PRISMA_TO_EDIT_TYPE[event.editType] : null;
      const weight = editType ? EDIT_TYPE_WEIGHT[editType] : 1.0; // neutral weight for unclassified/legacy edits
      const own: SlotInfo = { userId: event.userId, weight, source: event.source, day: analysisDayOf(event.timestamp) ?? "" };

      let inserted: SlotInfo[] | null = null;
      let restored = 0;
      const text = event.insertedText;
      const memory = remembered.get(event.userId);
      if (memory && text && text.length >= RESTORE_MIN_CHARS && text.length === event.length) {
        const removal = memory.get(text);
        if (removal) {
          const age = at - removal.at;
          if (age >= 0 && age <= RESTORE_WINDOW_MS) {
            inserted = removal.slots.map((s) => (s.userId !== event.userId ? s : own));
            restored = removal.slots.reduce((n, s) => n + (s.userId !== event.userId ? 1 : 0), 0);
          }
          memory.delete(text); // used up (or too old to ever match)
        }
      }
      if (!inserted) inserted = new Array(event.length).fill(own);

      slots.splice(event.position, 0, ...inserted);
      bump(totalInserted, event.userId, event.length - restored); // handed-back characters are not this user's new writing
      if (restored > 0) {
        bump(restoredChars, event.userId, restored);
        restoredByEvent.set(event.id, restored);
      }
      if (editType && restored < event.length) {
        const breakdown = editTypeBreakdown.get(event.userId) ?? emptyBreakdown();
        breakdown[editType]++;
        editTypeBreakdown.set(event.userId, breakdown);
      }
    } else {
      const removed = slots.slice(event.position, event.position + event.length);
      for (const slot of removed) {
        if (slot.userId === event.userId) bump(selfDeleted, event.userId, 1);
      }
      slots.splice(event.position, event.length);
      bump(totalDeleted, event.userId, event.length);

      // Remember removals that took someone else's text, so a later exact re-insert can hand it back.
      const text = event.deletedText;
      if (text && text.length >= RESTORE_MIN_CHARS && text.length === removed.length && removed.some((s) => s.userId !== event.userId)) {
        let memory = remembered.get(event.userId);
        if (!memory) {
          memory = new Map();
          remembered.set(event.userId, memory);
        }
        memory.delete(text); // a repeat removal of the same text moves to the newest position
        if (memory.size >= RESTORE_MAX_REMEMBERED_PER_USER) {
          const oldest = memory.keys().next().value;
          if (oldest !== undefined) memory.delete(oldest);
        }
        memory.set(text, { slots: removed, at });
      }
    }
  }

  return { slots, totalInserted, totalDeleted, selfDeleted, editTypeBreakdown, restoredChars, restoredByEvent };
}
