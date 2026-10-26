import { useCallback, useEffect, useRef, useState } from "react";
import { AI_POLL_MAX_MS, AI_POLL_MS, type AiReviewResponse } from "../lib/aiReview";

export interface UseAiReview {
  data: AiReviewResponse | null;
  /** Plain message from the last failed start; null otherwise. */
  error: string | null;
  /** Starts a review (instructor only; the server decides). Resolves true if one is running afterwards. */
  start: () => Promise<boolean>;
}

/**
 * Reads the stored AI review of a group and, while a review is running, re-reads it every 5 s for up
 * to 5 minutes. Never blocks the page: any failure just leaves `data` as it was.
 */
export function useAiReview(projectId: number, token: string | null): UseAiReview {
  const [data, setData] = useState<AiReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const startedAt = useRef<number | null>(null);

  const load = useCallback(async (): Promise<AiReviewResponse | null> => {
    try {
      const res = await fetch(`/api/groups/${projectId}/ai-review`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const body = (await res.json()) as AiReviewResponse;
      setData(body);
      return body;
    } catch {
      return null;
    }
  }, [projectId, token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const body = await load();
      if (cancelled || !body?.running) return;
      startedAt.current ??= Date.now();
      if (Date.now() - startedAt.current < AI_POLL_MAX_MS) timer = setTimeout(tick, AI_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, nonce, token]);

  // A different group starts from a clean slate.
  useEffect(() => {
    setData(null);
    setError(null);
    startedAt.current = null;
  }, [projectId]);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(`/api/groups/${projectId}/ai-review`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 202 || res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (res.status === 409 && body.code && body.code !== "REVIEW_IN_PROGRESS") {
          setError(body.error ?? "Could not start the AI findings.");
return false;
        }
        startedAt.current = Date.now();
        setData((d) => (d ? { ...d, running: true } : d));
        setNonce((n) => n + 1);
        return true;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not start the AI findings.");
      return false;
    } catch {
      setError("Network error — could not reach the server.");
      return false;
    }
  }, [projectId, token]);

  return { data, error, start };
}
