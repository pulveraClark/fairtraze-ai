/**
 * Shared wording and helpers for success, error and loading feedback.
 *
 * WORDING GUIDE
 * - Success: "<Thing> <past tense>."   Request accepted. Member removed. Settings saved. Project created.
 * - Error:   "<What failed>. <What to do>."   Could not remove the member. Try again.
 * - Simple English, short and calm. No exclamation marks, no blame, no technical words.
 * - Student and leader text never says free-rider, Gini, bands or team health ("Low contribution" only).
 * - A success message is shown only AFTER the server confirmed (see hooks/useAction.ts).
 * - Slow wait (more than about 3 seconds): SLOW_TEXT, the same line everywhere.
 * - No toast when the screen already shows the result (a ticked box, a card that moved with its own
 *   Undo toast, autosave with its own status chip, plain navigation).
 */

/** Wait before the "taking longer" line appears. */
export const SLOW_AFTER_MS = 3000;
export const SLOW_TEXT = "This is taking longer than usual.";
export const NETWORK_ERROR_TEXT = "Could not reach the server. Check your connection and try again.";
export const GENERIC_ERROR_TEXT = "Something went wrong. Try again.";

/** Error carrying a message that is safe to show to the user. */
export class ActionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ActionError";
  }
}

const NETWORK_FAILURE = /^(failed to fetch|networkerror|load failed|network request failed)/i;

/** One sentence for any thrown value. A browser network failure becomes NETWORK_ERROR_TEXT. */
export function errorMessage(err: unknown, fallback: string = GENERIC_ERROR_TEXT): string {
  if (err instanceof ActionError) return err.message || fallback;
  if (err instanceof TypeError || (err instanceof Error && NETWORK_FAILURE.test(err.message))) {
    return NETWORK_ERROR_TEXT;
  }
  if (err instanceof Error && err.message.trim() && err.name !== "AbortError") {
    // Our own request wrappers (e.g. TaskApiError) already carry a plain sentence.
    return err.message;
  }
  return fallback;
}

/** Turns a non-ok fetch Response into an ActionError using the server's plain `error` text if it sent one. */
export async function ensureOk(res: Response, fallback: string): Promise<Response> {
  if (res.ok) return res;
  let message = fallback;
  try {
    const source = typeof res.clone === "function" ? res.clone() : res; // plain objects in tests have no clone()
    const body = (await source.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error.trim()) message = body.error;
  } catch {
    // not JSON: keep the fallback
  }
  throw new ActionError(message, res.status);
}
