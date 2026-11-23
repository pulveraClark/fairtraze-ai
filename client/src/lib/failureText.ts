import { analysisFailureText } from "@shared/failureMessages";
import { AnalyzeError } from "./analyzeStream";

// The words a screen shows when something could not be done: what happened without blaming anyone, then what
// to do next. The sentences for a failed analysis live in shared/src/failureMessages.ts (the server sends the
// same ones); this file adds the cases only the browser can see.

/** The request never reached the server (offline, server asleep or restarting). */
export const NETWORK_ERROR_TEXT = "We couldn't reach the server. Check your connection, then try again.";

/** What to show for a failed analysis: the plain sentence for its code, or the network sentence. */
export function analysisErrorText(err: unknown): string {
  if (err instanceof AnalyzeError) return analysisFailureText(err.code, err.message);
  return NETWORK_ERROR_TEXT;
}

/** The same, for a failed analyze request answered with JSON (a card's Re-analyze button). */
export function analysisBodyText(body: { code?: unknown; error?: unknown } | null | undefined): string {
  return analysisFailureText(body?.code, typeof body?.error === "string" ? body.error : null);
}
