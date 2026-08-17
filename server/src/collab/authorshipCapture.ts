import WebSocket from "ws";
import type * as YTypes from "yjs";
import { EditEventType, EditType as PrismaEditType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { Y } from "./yjsCjs.js";
import { wsUserId } from "./connectionRegistry.js";
import { computeAuthorshipMap } from "./authorshipMap.js";
import { broadcastAuthorship } from "./authorshipBroadcast.js";
import { classifyEdit } from "@shared/editClassifier.js";
import type { EditType } from "@shared/editClassifier.js";

const FLUSH_DEBOUNCE_MS = 1500;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface PendingEvent {
  documentId: number;
  userId: number;
  eventType: EditEventType;
  position: number;
  length: number;
  timestamp: Date;
  editType?: PrismaEditType; // classification (Step 4b) — set on INSERT events only
}

// classifyEdit returns lowercase EditType keys; the Prisma enum is uppercase.
const EDIT_TYPE_TO_PRISMA: Record<EditType, PrismaEditType> = {
  substantive: PrismaEditType.SUBSTANTIVE,
  revision:    PrismaEditType.REVISION,
  formatting:  PrismaEditType.FORMATTING,
  trivial:     PrismaEditType.TRIVIAL,
};

// One user's in-progress editing session within a room, tracked in memory between debounced
// DB flushes. `sessionId` is null until the first flush creates the EditSession row.
interface SessionState {
  sessionId: number | null;
  startedAt: number; // epoch ms
  lastEventAt: number; // epoch ms
  pendingCharacterCount: number; // gross characters inserted since last flush
}

interface ClosedSession {
  sessionId: number;
  endedAtEpoch: number;
  pendingCharacterCount: number;
}

interface RoomState {
  documentId: number;
  lastText: string;
  pendingEvents: PendingEvent[];
  closedSessions: ClosedSession[];
  sessions: Map<number, SessionState>; // userId -> active in-memory session
  flushTimer: ReturnType<typeof setTimeout> | null;
}

// Keyed by room name. Overwritten (not merged) each time attachAuthorshipTracking runs for a
// room, since that only happens when y-websocket creates a *new* Y.Doc instance for the room
// (after the previous one was evicted with no connections left) — any prior in-memory state
// for that room name is stale relative to the fresh doc.
const rooms = new Map<string, RoomState>();

// Walks the Yjs XML tree and concatenates only real document text — Y.XmlText content via
// `.toString()`. This walk only ever touches `ydoc.getXmlFragment("default")`, the exact shared
// type `Collaboration.configure({document: ydoc})` syncs as document content. It never touches
// `provider.awareness` (a completely separate wire message type), which is where
// CollaborationCursor's name/color labels live — so cursor decorations can never leak in here.
function extractPlainText(node: YTypes.XmlFragment | YTypes.XmlElement | YTypes.XmlText): string {
  if (node instanceof Y.XmlText) {
    return node.toString();
  }
  let out = "";
  for (const child of node.toArray()) {
    out += extractPlainText(child as YTypes.XmlFragment | YTypes.XmlElement | YTypes.XmlText);
  }
  return out;
}

// Finds the single changed region between two strings via common-prefix/common-suffix trim.
// This assumes one contiguous changed region per Yjs update — true for the vast majority of
// real typing/paste/delete patterns, since each update corresponds to one transaction from one
// connection. A transaction that touches two disjoint regions at once (rare — e.g. an
// autoformat rule firing alongside typed input) produces one imprecisely-shaped span rather
// than two precise ones, but it is never misattributed to the wrong user: attribution comes
// from the update's origin connection, not from this diff. Documented as a known limitation,
// not solved with a diff library, given this step is visualization-only.
function diffText(
  before: string,
  after: string
): { position: number; deleteLength: number; insertLength: number } | null {
  const minLen = Math.min(before.length, after.length);
  let start = 0;
  while (start < minLen && before[start] === after[start]) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }

  const deleteLength = endBefore - start;
  const insertLength = endAfter - start;
  if (deleteLength === 0 && insertLength === 0) return null;
  return { position: start, deleteLength, insertLength };
}

function touchSession(state: RoomState, userId: number, insertedChars: number, nowEpoch: number): void {
  const existing = state.sessions.get(userId);
  if (existing && nowEpoch - existing.lastEventAt <= SESSION_IDLE_MS) {
    existing.lastEventAt = nowEpoch;
    existing.pendingCharacterCount += insertedChars;
    return;
  }

  if (existing?.sessionId != null) {
    // Idle gap passed — close the old session as of its own last observed event time, not
    // "now", so session duration reflects actual work time rather than detection latency.
    state.closedSessions.push({
      sessionId: existing.sessionId,
      endedAtEpoch: existing.lastEventAt,
      pendingCharacterCount: existing.pendingCharacterCount,
    });
  }

  state.sessions.set(userId, {
    sessionId: null,
    startedAt: nowEpoch,
    lastEventAt: nowEpoch,
    pendingCharacterCount: insertedChars,
  });
}

async function flushRoom(room: string): Promise<void> {
  const state = rooms.get(room);
  if (!state) return;
  state.flushTimer = null;

  const events = state.pendingEvents;
  state.pendingEvents = [];
  const closed = state.closedSessions;
  state.closedSessions = [];
  const dirtyUserIds = [...state.sessions.entries()]
    .filter(([, s]) => s.sessionId === null || s.pendingCharacterCount > 0)
    .map(([userId]) => userId);

  try {
    if (events.length > 0) {
      await prisma.editEvent.createMany({ data: events });
    }

    for (const c of closed) {
      await prisma.editSession.update({
        where: { id: c.sessionId },
        data: { endedAt: new Date(c.endedAtEpoch), characterCount: { increment: c.pendingCharacterCount } },
      });
    }

    for (const userId of dirtyUserIds) {
      const session = state.sessions.get(userId);
      if (!session) continue;
      const delta = session.pendingCharacterCount;
      session.pendingCharacterCount = 0;

      if (session.sessionId === null) {
        const created = await prisma.editSession.create({
          data: {
            documentId: state.documentId,
            userId,
            startedAt: new Date(session.startedAt),
            characterCount: delta,
          },
        });
        session.sessionId = created.id;
      } else if (delta > 0) {
        await prisma.editSession.update({
          where: { id: session.sessionId },
          data: { characterCount: { increment: delta } },
        });
      }
    }

    if (events.length > 0 || closed.length > 0) {
      const map = await computeAuthorshipMap(state.documentId);
      broadcastAuthorship(room, map);
    }
  } catch (err) {
    console.error(`[collab] authorship flush failed for ${room}`, err);
  }
}

function scheduleFlush(room: string): void {
  const state = rooms.get(room);
  if (!state) return;
  if (state.flushTimer) clearTimeout(state.flushTimer);
  state.flushTimer = setTimeout(() => {
    flushRoom(room).catch((err) => console.error(`[collab] flush error for ${room}`, err));
  }, FLUSH_DEBOUNCE_MS);
}

// Called once per room, as the last step of persistence.ts's bindState — after any persisted
// yjsState/legacy content has already been applied to `ydoc`, so the initial plain-text
// snapshot below reflects the room's real starting content, not an empty document.
export async function attachAuthorshipTracking(room: string, groupId: number, ydoc: YTypes.Doc): Promise<void> {
  const doc = await prisma.document.upsert({
    where: { groupId },
    update: {},
    create: { groupId },
  });

  const fragment = ydoc.getXmlFragment("default");
  const state: RoomState = {
    documentId: doc.id,
    lastText: extractPlainText(fragment),
    pendingEvents: [],
    closedSessions: [],
    sessions: new Map(),
    flushTimer: null,
  };
  rooms.set(room, state);

  ydoc.on("update", (_update: Uint8Array, origin: unknown) => {
    // y-websocket sets `origin` to the raw ws connection for every update that arrived over
    // the wire from that connection (verified against y-websocket/y-protocols source). Updates
    // applied locally with no origin (persisted-state restore, legacy-content migration) are
    // naturally excluded here, so they're never misattributed to a "user".
    if (!(origin instanceof WebSocket)) return;
    const userId = wsUserId.get(origin);
    if (userId === undefined) return;

    const newText = extractPlainText(fragment);
    const diff = diffText(state.lastText, newText);
    state.lastText = newText;
    if (!diff) return;

    const now = new Date();
    // Delete recorded before insert so a same-position "replace" replays correctly.
    if (diff.deleteLength > 0) {
      state.pendingEvents.push({
        documentId: state.documentId,
        userId,
        eventType: EditEventType.DELETE,
        position: diff.position,
        length: diff.deleteLength,
        timestamp: now,
      });
    }
    if (diff.insertLength > 0) {
      const editType = classifyEdit({ insertLength: diff.insertLength, deleteLength: diff.deleteLength });
      state.pendingEvents.push({
        documentId: state.documentId,
        userId,
        eventType: EditEventType.INSERT,
        position: diff.position,
        length: diff.insertLength,
        timestamp: now,
        editType: EDIT_TYPE_TO_PRISMA[editType],
      });
    }

    touchSession(state, userId, diff.insertLength, now.getTime());
    scheduleFlush(room);
  });
}

// Closes sessions that have gone idle for 30+ minutes even when no further edit event ever
// arrives to trigger the check in touchSession. Started once at server boot (see index.ts).
export function startAuthorshipIdleSweep(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [room, state] of rooms) {
      let shouldFlush = false;
      for (const [userId, session] of state.sessions) {
        if (now - session.lastEventAt <= SESSION_IDLE_MS) continue;
        if (session.sessionId !== null) {
          state.closedSessions.push({
            sessionId: session.sessionId,
            endedAtEpoch: session.lastEventAt,
            pendingCharacterCount: session.pendingCharacterCount,
          });
          shouldFlush = true;
        }
        state.sessions.delete(userId);
      }
      if (shouldFlush) {
        flushRoom(room).catch((err) => console.error(`[collab] idle-sweep flush failed for ${room}`, err));
      }
    }
  }, SWEEP_INTERVAL_MS);
}

// Safety net for sessions left with endedAt=null by a previous server crash/restart — there's
// no in-memory state to recover across a restart, so any dangling open session is definitely
// stale. Called once at server boot (see index.ts), before any new connections arrive.
export async function closeDanglingSessions(): Promise<void> {
  await prisma.editSession.updateMany({
    where: { endedAt: null },
    data: { endedAt: new Date() },
  });
}
