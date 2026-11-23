import { useCallback, useRef } from "react";
import { useToast } from "../components/Toast";

export const SAVING_TOAST_MS = 2000;

/**
 * "Still saving, one moment" for a card whose move has not been answered yet. Neutral tone, and only
 * one at a time: further attempts while the message is still showing add nothing.
 */
export function useSavingBlockedToast(): () => void {
  const { showToast } = useToast();
  const lastShownAt = useRef<number | null>(null);
  return useCallback(() => {
    const now = Date.now();
    if (lastShownAt.current !== null && now - lastShownAt.current < SAVING_TOAST_MS) return;
    lastShownAt.current = now;
    showToast({ tone: "info", message: "Still saving, one moment", durationMs: SAVING_TOAST_MS });
  }, [showToast]);
}
