import { COLLAB_PERSIST_DEBOUNCE_MS } from "@shared/collabVersion";

export type SaveState = "connecting" | "saving" | "saved" | "offline";
export type ProviderStatus = "connecting" | "connected" | "disconnected";

/**
 * How long after the last local edit before "All changes saved" may show. The collab server saves to the
 * database after the last change (server/src/collab/persistence.ts reads COLLAB_PERSIST_DEBOUNCE_MS from
 * shared/src/collabVersion.ts, the same constant used here), so we wait that long plus a margin. There is no per-update acknowledgement from the server, so this is the
 * honest bound we can offer.
 */
export const SAVE_SETTLE_MS = COLLAB_PERSIST_DEBOUNCE_MS + 500;

export const SAVE_STATE_TEXT: Record<SaveState, string> = {
  connecting: "Connecting…",
  saving: "Saving…",
  saved: "All changes saved",
  offline: "Offline. Changes will sync when you reconnect.",
};

/**
 * Pure mapping from the sync provider's state to what the person sees.
 *  - "saved" only when connected AND synced AND nothing local is still pending.
 *  - Not connected: "Connecting…" only before the first connection; afterwards (or after a failure) "offline".
 */
export function saveStateOf(input: { status: ProviderStatus; synced: boolean; dirty: boolean; hasConnected: boolean }): SaveState {
  const { status, synced, dirty, hasConnected } = input;
  if (status === "connected") {
    if (!synced) return "connecting";
    return dirty ? "saving" : "saved";
  }
  if (status === "connecting" && !hasConnected) return "connecting";
  return "offline";
}
