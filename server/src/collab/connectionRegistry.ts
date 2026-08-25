import type WebSocket from "ws";

// Maps a live collab WebSocket connection to the authenticated user it belongs to. Set once,
// right after auth succeeds and before the connection is handed to setupWSConnection/the
// authorship broadcast registry, so later code (authorshipCapture.ts) can recover "which user
// made this Yjs update" from the update event's origin (== the ws connection itself — see
// authorshipCapture.ts for why that's a reliable signal).
export const wsUserId = new WeakMap<WebSocket, number>();
