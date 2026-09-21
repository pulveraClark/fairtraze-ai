import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { setPersistence, setupWSConnection } from "y-websocket/bin/utils";
import { resolveCollabAuth, statusLine } from "./collabAuth.js";
import { wsUserId } from "./connectionRegistry.js";
import { yjsPersistence } from "./persistence.js";

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

        wss.handleUpgrade(req, socket, head, (ws) => {
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
