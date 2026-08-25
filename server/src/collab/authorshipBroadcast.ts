import type { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { resolveCollabAuth, statusLine } from "./collabAuth.js";
import type { AuthorshipMap } from "./authorshipMap.js";

// A second, dedicated WS route (separate from /collab/<room>, the Yjs sync socket) that only
// ever pushes JSON authorship-map updates to connected clients. Kept off the Yjs sync socket
// deliberately: the y-websocket client treats every message on that socket as binary
// sync/awareness protocol data, so injecting our own JSON messages there risks corrupting its
// decoder. This route never reads incoming messages — it's push-only.
const ROOM_PATTERN = /^\/collab-authorship\/(group-doc-(\d+))$/;

const roomSockets = new Map<string, Set<WebSocket>>();

export function attachAuthorshipBroadcastServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    void (async () => {
      try {
        const auth = await resolveCollabAuth(req, ROOM_PATTERN);
        if (!auth.ok) {
          if (auth.status === 0) return; // not a /collab-authorship/ request — leave it for other listeners
          socket.write(statusLine(auth.status));
          socket.destroy();
          return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
          let sockets = roomSockets.get(auth.room);
          if (!sockets) {
            sockets = new Set();
            roomSockets.set(auth.room, sockets);
          }
          sockets.add(ws);

          ws.on("close", () => {
            sockets!.delete(ws);
            if (sockets!.size === 0) roomSockets.delete(auth.room);
          });
        });
      } catch (err) {
        console.error("[collab] authorship-broadcast upgrade handler failed", err);
        socket.destroy();
      }
    })();
  });
}

export function broadcastAuthorship(room: string, map: AuthorshipMap): void {
  const sockets = roomSockets.get(room);
  if (!sockets || sockets.size === 0) return;

  const payload = JSON.stringify({ type: "authorship", spans: map.spans, users: map.users });
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}
