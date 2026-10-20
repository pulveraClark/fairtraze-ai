import { useEffect, useState } from "react";

// The server's EMAIL_ENABLED switch, read once from the public GET /api/config and shared by every
// caller. It defaults to "on" while loading and when the request fails, so a missing answer never
// hides a working feature (the server still enforces the real setting).
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

function loadEmailEnabled(): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return true;
        const body = (await res.json()) as { emailEnabled?: boolean };
        cached = body.emailEnabled !== false;
        return cached;
      } catch {
        return true;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

export function useEmailEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? true);

  useEffect(() => {
    if (cached !== null) {
      setEnabled(cached);
      return;
    }
    let live = true;
    void loadEmailEnabled().then((value) => {
      if (live) setEnabled(value);
    });
    return () => {
      live = false;
    };
  }, []);

  return enabled;
}

/** Tests only: forget the cached answer. */
export function resetEmailEnabledCache(): void {
  cached = null;
  inflight = null;
}
