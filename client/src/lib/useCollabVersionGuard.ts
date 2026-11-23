import { useEffect, useRef, useState } from "react";
import { COLLAB_SCHEMA_VERSION, COLLAB_VERSION_CLOSE_CODE } from "@shared/collabVersion";

/** The slice of y-websocket's WebsocketProvider this guard needs. */
export interface GuardedProvider {
  on(event: "connection-close", cb: (e: { code?: number } | null) => void): void;
  off(event: "connection-close", cb: (e: { code?: number } | null) => void): void;
  disconnect(): void;
}

const POLL_MS = 60_000;

/**
 * Detects a client whose document schema is out of date, in two ways:
 *  1. the collab server closes the socket with COLLAB_VERSION_CLOSE_CODE (it refuses mismatched
 *     clients), or
 *  2. GET /api/version reports a different schema version than this build (a deploy happened while
 *     the tab was open) - checked on mount, on window focus and every minute.
 * On a mismatch it disconnects the provider so NO further Yjs updates are sent, and returns
 * `mismatch: true` so the editor can go read-only and show the reload banner. Why this matters:
 * an old client deletes content it does not understand and syncs the deletion (shared/src/collabVersion.ts).
 */
export function useCollabVersionGuard(provider: GuardedProvider | null): { mismatch: boolean } {
  const [mismatch, setMismatch] = useState(false);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  useEffect(() => {
    if (!provider) return;
    let stopped = false;

    const trigger = () => {
      if (stopped) return;
      stopped = true;
      providerRef.current?.disconnect();
      setMismatch(true);
    };

    const onClose = (e: { code?: number } | null) => {
      if (e?.code === COLLAB_VERSION_CLOSE_CODE) trigger();
    };
    provider.on("connection-close", onClose);

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;
        const body = (await res.json()) as { collabSchemaVersion?: number };
        if (typeof body.collabSchemaVersion === "number" && body.collabSchemaVersion !== COLLAB_SCHEMA_VERSION) trigger();
      } catch {
        // Offline or the server is restarting: not a mismatch. The next check will tell.
      }
    };
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);

    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      provider.off("connection-close", onClose);
    };
  }, [provider]);

  return { mismatch };
}
