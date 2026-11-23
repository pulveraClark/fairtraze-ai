import type WebSocket from "ws";

// Maps a live collab WebSocket connection to the authenticated user it belongs to. Set once,
// right after auth succeeds and before the connection is handed to setupWSConnection/the
// authorship broadcast registry, so later code (authorshipCapture.ts) can recover "which user
// made this Yjs update" from the update event's origin (== the ws connection itself — see
// authorshipCapture.ts for why that's a reliable signal).
export const wsUserId = new WeakMap<WebSocket, number>();

// Connections of users who may read the document but not change it (the class instructor, an admin
// who owns the class): everyone who passed collab auth without being a group member. readOnlyGate.ts
// drops their document-changing messages; authorshipCapture.ts also refuses to attribute any update
// whose origin is one of these, as a second line of defence.
export const readOnlyWs = new WeakSet<WebSocket>();
