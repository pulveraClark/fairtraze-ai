import type WebSocket from "ws";
import type { RawData } from "ws";
import { readOnlyWs } from "./connectionRegistry.js";

// y-websocket message framing (y-protocols/sync): a message is varuint(messageType), and for the sync
// type (0) a varuint(sync subtype). Subtype 0 = step 1 (a state vector: a READ request), 1 = step 2
// and 2 = update (both carry document changes). Awareness is its own top-level type (1).
const MESSAGE_SYNC = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;

function readVarUint(bytes: Uint8Array, at: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  for (let i = at; i < bytes.length && shift <= 28; i++) {
    const b = bytes[i]!;
    value += (b & 0x7f) * 2 ** shift;
    if (b < 0x80) return { value, next: i + 1 };
    shift += 7;
  }
  return null;
}

// True for a sync message that would change the document (step 2 or update). Step 1 (the client asking
// for the document), awareness (cursors) and anything unrecognised pass through; y-websocket itself
// ignores types it does not know, and a truncated or garbage sync message cannot be a write.
export function isDocumentWriteMessage(bytes: Uint8Array): boolean {
  const type = readVarUint(bytes, 0);
  if (!type || type.value !== MESSAGE_SYNC) return false;
  const sub = readVarUint(bytes, type.next);
  return !!sub && (sub.value === SYNC_STEP_2 || sub.value === SYNC_UPDATE);
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

// Makes `ws` read-only on the SERVER. The instructor's editor is read-only only in the browser
// (`editable={false}`), but y-tiptap's sync plugin still writes the browser's document back into Yjs
// (it does not look at `editable`), and any client can send what it likes. Incoming sync step-2 and
// update messages from such a connection are dropped before y-websocket sees them, so they are never
// applied, broadcast, persisted or attributed. Reading still works: the client's step 1 is answered, it
// receives everyone's updates, and its awareness (cursor) messages are still accepted.
//
// Wraps `emit` rather than adding a listener, because y-websocket registers its own 'message' listener
// in setupWSConnection and a second listener cannot veto the first.
export function makeReadOnly(ws: WebSocket): void {
  readOnlyWs.add(ws);
  const emit = ws.emit.bind(ws) as (event: string | symbol, ...args: unknown[]) => boolean;
  (ws as { emit: typeof emit }).emit = (event, ...args) => {
    if (event === "message" && isDocumentWriteMessage(toBytes(args[0] as RawData))) return false;
    return emit(event, ...args);
  };
}
