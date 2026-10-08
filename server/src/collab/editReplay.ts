import { prisma } from "../lib/prisma.js";
import type { EditEvent, EditType as PrismaEditType, EditSource } from "@prisma/client";
import { EDIT_TYPE_WEIGHT } from "@shared/editClassifier.js";
import type { EditType } from "@shared/editClassifier.js";

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
}

export interface ReplayResult {
  slots: SlotInfo[]; // slots[i] = who currently owns char i, and the significance weight it carries
  totalInserted: Map<number, number>;
  totalDeleted: Map<number, number>;
  selfDeleted: Map<number, number>; // subset of totalDeleted: same user who inserted also deleted
  editTypeBreakdown: Map<number, EditTypeBreakdown>; // per-user counts of classified INSERT events
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

  for (const event of events) {
    if (event.eventType === "INSERT") {
      const editType = event.editType ? PRISMA_TO_EDIT_TYPE[event.editType] : null;
      const weight = editType ? EDIT_TYPE_WEIGHT[editType] : 1.0; // neutral weight for unclassified/legacy edits
      const inserted: SlotInfo[] = new Array(event.length).fill({ userId: event.userId, weight, source: event.source });
      slots.splice(event.position, 0, ...inserted);
      bump(totalInserted, event.userId, event.length);
      if (editType) {
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
    }
  }

  return { slots, totalInserted, totalDeleted, selfDeleted, editTypeBreakdown };
}
