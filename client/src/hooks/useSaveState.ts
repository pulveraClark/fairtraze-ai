import { useEffect, useState } from "react";
import type * as Y from "yjs";
import type { WebsocketProvider } from "y-websocket";
import { SAVE_SETTLE_MS, saveStateOf, type ProviderStatus, type SaveState } from "../lib/saveState";

const RECHECK_MS = 500;

/**
 * Save state of the shared document, from the sync provider's own events. Read-only: it listens, it never
 * writes to the document. Returns null when `enabled` is false (the instructor's read-only view).
 *
 *  - status / sync events give connected + synced.
 *  - A local edit (a Yjs update whose origin is not the provider) marks the document "dirty".
 *  - Dirty clears only after SAVE_SETTLE_MS with the socket connected, synced and nothing left in the socket's
 *    send buffer. If those do not hold, the check is retried when the provider reports a new status or sync
 *    (no timer polling while offline), so "saved" is never shown for text that has not left the browser.
 * Listeners and the timer are removed on unmount and when the provider changes (route change).
 */
export function useSaveState(provider: WebsocketProvider | null, ydoc: Y.Doc | null, enabled: boolean): SaveState | null {
  const [state, setState] = useState<SaveState | null>(null);

  useEffect(() => {
    if (!enabled || !provider || !ydoc) {
      setState(null);
      return;
    }
    let status: ProviderStatus = provider.wsconnected ? "connected" : provider.wsconnecting ? "connecting" : "disconnected";
    let synced = provider.synced;
    let hasConnected = provider.wsconnected;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const publish = () => setState(saveStateOf({ status, synced, dirty, hasConnected }));
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const canClear = () => status === "connected" && synced && (provider.ws?.bufferedAmount ?? 0) === 0;

    const scheduleCheck = (delay: number) => {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (!dirty) return;
        if (canClear()) {
          dirty = false;
          publish();
        } else if (status === "connected" && synced) {
          scheduleCheck(RECHECK_MS); // bytes still in the send buffer
        } // otherwise wait for the next status/sync event
      }, delay);
    };

    const onStatus = (e: { status: ProviderStatus }) => {
      status = e.status;
      if (status === "connected") hasConnected = true;
      publish();
    };
    const onSync = (isSynced: boolean) => {
      synced = isSynced;
      publish();
      if (isSynced && dirty) scheduleCheck(SAVE_SETTLE_MS);
    };
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === provider) return; // came from the server or another tab: nothing of ours is pending
      dirty = true;
      publish();
      scheduleCheck(SAVE_SETTLE_MS);
    };

    provider.on("status", onStatus);
    provider.on("sync", onSync);
    ydoc.on("update", onUpdate);
    publish();
    return () => {
      provider.off("status", onStatus);
      provider.off("sync", onSync);
      ydoc.off("update", onUpdate);
      clearTimer();
    };
  }, [provider, ydoc, enabled]);

  return state;
}
