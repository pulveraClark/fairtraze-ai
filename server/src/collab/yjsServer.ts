import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { setPersistence, setupWSConnection } from "y-websocket/bin/utils";
import { resolveCollabAuth, statusLine } from "./collabAuth.js";
import { wsUserId } from "./connectionRegistry.js";
import { yjsPersistence } from "./persistence.js";
import { COLLAB_SCHEMA_VERSION, COLLAB_VERSION_CLOSE_CODE } from "@shared/collabVersion.js";

const ROOM_PATTERN = /^\/collab\/(group-doc-(\d+))$/;

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
          setupWSConnection(ws, req, { docName: auth.room, gc: true });
        });
      } catch (err) {
        console.error("[collab] upgrade handler failed", err);
        socket.destroy();
      }
    })();
  });
}
