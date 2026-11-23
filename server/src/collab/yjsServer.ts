import type { Server as HttpServer } from "http";
import type { IncomingMessage } from "http";
import WebSocket, { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { docs, getYDoc, setPersistence, setupWSConnection } from "y-websocket/bin/utils";
import { resolveCollabAuth, statusLine } from "./collabAuth.js";
import { wsUserId } from "./connectionRegistry.js";
import { makeReadOnly } from "./readOnlyGate.js";
import { RoomUnavailableError, roomReady, yjsPersistence } from "./persistence.js";
import { COLLAB_SCHEMA_VERSION, COLLAB_VERSION_CLOSE_CODE } from "@shared/collabVersion.js";

const ROOM_PATTERN = /^\/collab\/(group-doc-(\d+))$/;

// Closed with this code when the room could not be restored in time (or at all). Unlike the version
// mismatch code, y-websocket's client treats it as an ordinary disconnect and reconnects with
// backoff, which is what we want: the room is usually ready a moment later.
export const COLLAB_ROOM_UNAVAILABLE_CLOSE_CODE = 4503;

// How many times to re-fetch the room if it is evicted while we wait for it to be ready.
const MAX_ROOM_ATTEMPTS = 3;

// Joins `ws` to its room only once the room's persisted state has been restored. y-websocket's
// getYDoc() fires bindState without awaiting it, and setupWSConnection sends sync-step-1 at once:
// with the not-yet-restored (empty) state vector, a client holding the whole document answers with
// all of it, and authorshipCapture would credit that to the connection as one whole-document INSERT
// (staging group 86). So the socket is accepted first, its incoming messages are buffered (the
// client's own sync-step-1 must not be lost), the room is awaited, and only then is it handed to
// setupWSConnection and the buffer replayed. A room that failed to restore, or is still not ready
// after ROOM_READY_TIMEOUT_MS, is never served: the connection is closed with an error instead.
async function joinRoomWhenReady(ws: WebSocket, req: IncomingMessage, room: string): Promise<void> {
  const buffered: { data: RawData; isBinary: boolean }[] = [];
  let closed = false;
  const onMessage = (data: RawData, isBinary: boolean) => buffered.push({ data, isBinary });
  const onClose = () => {
    closed = true;
  };
  ws.on("message", onMessage);
  ws.once("close", onClose);

  let doc: ReturnType<typeof getYDoc> | undefined;
  try {
    for (let attempt = 1; ; attempt++) {
      doc = getYDoc(room, true);
      await roomReady(room);
      // setupWSConnection looks the room up again; if the last client of a previous instance left
      // while we waited, the room was evicted and a new, unrestored one would be created there.
      if (docs.get(room) === doc) break;
      if (attempt >= MAX_ROOM_ATTEMPTS) throw new RoomUnavailableError(room, "not-bound");
    }
  } catch (err) {
    ws.off("message", onMessage);
    ws.off("close", onClose);
    console.error(`[collab] refusing connection to ${room}`, err);
    if (err instanceof RoomUnavailableError && err.reason === "restore-failed" && doc && docs.get(room) === doc) {
      // Never serve (or persist) the empty doc; drop it so the next connection restores afresh.
      if ((doc as unknown as { conns: Map<unknown, unknown> }).conns.size === 0) {
        docs.delete(room);
        doc.destroy();
      }
    }
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(COLLAB_ROOM_UNAVAILABLE_CLOSE_CODE, "room-unavailable");
    }
    return;
  }

  ws.off("message", onMessage);
  ws.off("close", onClose);
  if (closed || ws.readyState !== WebSocket.OPEN) return; // the client left while waiting

  setupWSConnection(ws, req, { docName: room, gc: true });
  for (const m of buffered) ws.emit("message", m.data, m.isBinary);
}

export function attachYjsCollabServer(httpServer: HttpServer): void {
  setPersistence(yjsPersistence);

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    void (async () => {
      try {
        const auth = await resolveCollabAuth(req, ROOM_PATTERN);
        if (!auth.ok) {
          if (auth.status === 0) return; // not a /collab/ request — leave it for other listeners
          socket.write(statusLine(auth.status));
          socket.destroy();
          return;
        }

        // Schema-version gate (see shared/src/collabVersion.ts). A client that sends no `v` is a
        // pre-pageBreak client (version 1). Refused before it can join the room, so an old client can
        // never apply, or delete, content it does not understand. Connection gating only - the sync,
        // persistence and authorship-capture paths below are untouched.
        const clientVersion = Number(new URL(req.url ?? "", "http://internal").searchParams.get("v") ?? 1);
        const versionOk = clientVersion === COLLAB_SCHEMA_VERSION;

        wss.handleUpgrade(req, socket, head, (ws) => {
          if (!versionOk) {
            ws.close(COLLAB_VERSION_CLOSE_CODE, "version-mismatch");
            return;
          }
          // Recorded before setupWSConnection so authorshipCapture.ts can attribute this
          // connection's future Yjs updates (whose `origin` is this exact ws) to auth.userId.
          wsUserId.set(ws, auth.userId);
          // Before anything can be received (so before joinRoomWhenReady buffers messages).
          if (!auth.canWrite) makeReadOnly(ws);
          void joinRoomWhenReady(ws, req, auth.room);
        });
      } catch (err) {
        console.error("[collab] upgrade handler failed", err);
        socket.destroy();
      }
    })();
  });
}
