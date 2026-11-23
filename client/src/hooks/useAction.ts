import { useCallback } from "react";
import { useToast } from "../components/Toast";
import { ensureOk, errorMessage, SLOW_AFTER_MS } from "../lib/feedback";
import { useSlowAfter } from "./useSlowAfter";
import { useSubmitGuard } from "./useSubmitGuard";

export interface ActionOptions<T> {
  /**
   * Shown only AFTER the work finished and the server confirmed. Pass `null` to say on purpose that this
   * action needs no toast (the screen already shows the result). Required so nobody forgets to decide.
   */
  success: string | ((value: T) => string) | null;
  /** "<What failed>. <What to do>." Used when the server gave no plain message of its own. */
  error: string;
  /** Show the error inline instead of as a toast (the caller renders the message). */
  onError?: (message: string, err: unknown) => void;
  /** Runs after success, before the toast. */
  onSuccess?: (value: T) => void;
}

/** A fetch Response, or anything shaped like one (a boolean `ok` and a `json()`): a non-ok one is a failure. */
function isResponseLike(value: unknown): value is Response {
  return typeof value === "object" && value !== null
    && typeof (value as { ok?: unknown }).ok === "boolean"
    && typeof (value as { json?: unknown }).json === "function";
}

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; skipped?: boolean; message?: string };

/**
 * One way to run a button action: blocks double submit, exposes `busy` and `slow`, and gives
 * feedback. A returned fetch Response that is not ok counts as a failure, so a non-ok answer can
 * never produce a success toast.
 *
 *   const { run, busy } = useAction();
 *   await run(() => fetch(url, { method: "POST" }), { success: "Request accepted.", error: "Could not accept the request. Try again." });
 */
export function useAction() {
  const { showSuccessToast, showError } = useToast();
  const guard = useSubmitGuard();
  const slow = useSlowAfter(guard.submitting, SLOW_AFTER_MS);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, options: ActionOptions<T>): Promise<ActionResult<T>> => {
      const outcome = await guard.run(async (): Promise<ActionResult<T>> => {
        try {
          const value = await fn();
          if (isResponseLike(value)) await ensureOk(value, options.error);
          return { ok: true, value };
        } catch (err) {
          const message = errorMessage(err, options.error);
          if (options.onError) options.onError(message, err);
          else showError(message);
          return { ok: false, message };
        }
      });
      if (!outcome) return { ok: false, skipped: true };
      if (outcome.ok) {
        options.onSuccess?.(outcome.value);
        const text = typeof options.success === "function" ? options.success(outcome.value) : options.success;
        if (text) showSuccessToast(text);
      }
      return outcome;
    },
    [guard.run, showError, showSuccessToast],
  );

  return { run, busy: guard.submitting, slow };
}
