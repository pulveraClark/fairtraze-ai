import { useCallback, useEffect, useState } from "react";

/** The slice of y-websocket's WebsocketProvider this hook needs. */
export interface SyncProvider {
  synced: boolean;
  on(event: "sync", cb: (isSynced: boolean) => void): void;
  off(event: "sync", cb: (isSynced: boolean) => void): void;
  connect(): void;
  disconnect(): void;
}

export const STILL_CONNECTING_MS = 10_000;

/**
 * Tracks the shared document's FIRST sync. `synced` latches true once the server has sent the
 * document (a later drop does not lock the editor again; the toolbar shows "Reconnecting…").
 * `stalled` turns true when that first sync takes longer than STILL_CONNECTING_MS, so the page can
 * say what is wrong instead of staying silently locked. `retry` reconnects the provider.
 * This hook only reports state: it never makes anything editable by itself.
 */
export function useCollabSync(provider: SyncProvider | null): { synced: boolean; stalled: boolean; retry: () => void } {
  const [synced, setSynced] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSynced(false);
    setStalled(false);
    if (!provider) return;
    const onSync = (isSynced: boolean) => {
      if (isSynced) setSynced(true);
    };
    provider.on("sync", onSync);
    if (provider.synced) setSynced(true);
    return () => provider.off("sync", onSync);
  }, [provider]);

  useEffect(() => {
    if (!provider || synced) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STILL_CONNECTING_MS);
    return () => clearTimeout(timer);
  }, [provider, synced, attempt]);

  const retry = useCallback(() => {
    if (!provider) return;
    setStalled(false);
    provider.disconnect();
    provider.connect();
    setAttempt((n) => n + 1);
  }, [provider]);

  return { synced, stalled, retry };
}
