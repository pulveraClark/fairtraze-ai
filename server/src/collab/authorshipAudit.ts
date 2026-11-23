import type { EditEvent } from "@prisma/client";
import type * as YTypes from "yjs";
import { Y } from "./yjsCjs.js";
import { extractPlainText } from "./authorshipCapture.js";
import { replayEditEvents } from "./editReplay.js";

// Pure helpers behind scripts/auditPhantomInserts.ts. Nothing here touches the database or scoring.
//
// What they detect: the EditEvent log is replayed into one "slot" per surviving character
// (editReplay.ts). When the log is consistent with the saved document, slot count == the document's
// plain-text length. A phantom whole-document INSERT (one connection credited with text that already
// existed, see persistence.ts roomReady) adds that many extra slots at position 0, so the counts
// diverge, the authorship colours shift, and for a group member their retained characters are inflated.

export interface AuditSummary {
  eventCount: number;
  insertedTotal: number; // SUM(length) of INSERT events
  deletedTotal: number; // SUM(length) of DELETE events
  netTotal: number; // inserted - deleted
  slotCount: number; // characters the replay believes exist
  slotsByUser: Record<number, number>; // retained characters per user, per the replay
}

export function summarizeEvents(events: EditEvent[]): AuditSummary {
  const { slots } = replayEditEvents(events);
  const slotsByUser: Record<number, number> = {};
  for (const s of slots) slotsByUser[s.userId] = (slotsByUser[s.userId] ?? 0) + 1;
  let insertedTotal = 0;
  let deletedTotal = 0;
  for (const e of events) {
    if (e.eventType === "INSERT") insertedTotal += e.length;
    else deletedTotal += e.length;
  }
  return {
    eventCount: events.length,
    insertedTotal,
    deletedTotal,
    netTotal: insertedTotal - deletedTotal,
    slotCount: slots.length,
    slotsByUser,
  };
}

// Length of the document's plain text exactly as authorshipCapture.ts measures it.
export function plainTextLengthOf(yjsState: Uint8Array): number {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, yjsState);
    return extractPlainText(ydoc.getXmlFragment("default") as YTypes.XmlFragment).length;
  } finally {
    ydoc.destroy();
  }
}

export interface PhantomCandidate {
  event: EditEvent;
  without: AuditSummary; // the log with just this event removed
  reconciles: boolean; // true when removing it makes the replay match the document length
}

// INSERT events big enough to be a whole-document re-seed (at least a quarter of the document and at
// least 50 characters), each with the effect of removing it. Only `reconciles` candidates are safe to
// remove; the script still requires the operator to name the ids explicitly.
export function findPhantomCandidates(events: EditEvent[], textLength: number): PhantomCandidate[] {
  const threshold = Math.max(50, Math.ceil(textLength * 0.25));
  return events
    .filter((e) => e.eventType === "INSERT" && e.length >= threshold)
    .map((event) => {
      const without = summarizeEvents(events.filter((e) => e.id !== event.id));
      return { event, without, reconciles: without.slotCount === textLength };
    });
}
