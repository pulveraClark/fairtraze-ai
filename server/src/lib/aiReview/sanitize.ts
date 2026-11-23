import { scrubFreeText, type PseudonymEntry } from "../geminiPseudonyms.js";
import { redactSecrets } from "./redact.js";
import { screenInjection } from "./injection.js";

// The one gate every piece of student text passes before it can reach Gemini:
// secrets and emails out, names and GitHub logins swapped for pseudonyms, lines that talk to the AI
// replaced. `injected` counts those lines so the instructor can be told (neutral wording).

export interface Sanitized {
  text: string;
  injected: number;
}

export function sanitizeForAi(text: string, entries: ReadonlyArray<PseudonymEntry>): Sanitized {
  const scrubbed = scrubFreeText(redactSecrets(text), entries);
  const { text: safe, count } = screenInjection(scrubbed);
  return { text: safe, injected: count };
}

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
