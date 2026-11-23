import { analysisDayOf } from "./analysisDay.js";

/** "Exported by [name], [email], [date]": the footer of the report PDFs and the admin users CSV. */
export function exportedByLine(who: { name: string; email: string }, when: Date): string {
  return `Exported by ${who.name}, ${who.email}, ${analysisDayOf(when) ?? ""}`;
}
