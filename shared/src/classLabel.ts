// The one class label every screen and printout uses. Lives in shared/ so the server (student evidence
// report) and the client (instructor copy, breadcrumbs, cards) can never word a class differently.
// Display only: nothing here is read by scoring.

/** The two official codes of a class section. The EDP code is the school's own code and always stays visible. */
export interface ClassCodes {
  subjectCode?: string | null;
  edpCode?: string | null;
}

/** The one format every screen uses for a class: "UXA-101 · EDP 12345" (just "UXA-101" when it has no EDP code). */
export function classFullLabel(c: ClassCodes): string {
  const subject = c.subjectCode?.trim() ?? "";
  const edp = c.edpCode?.trim() ?? "";
  if (subject && edp) return `${subject} \u00B7 EDP ${edp}`;
  return subject || (edp ? `EDP ${edp}` : "");
}
