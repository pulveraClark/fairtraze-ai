/**
 * Class identity colour: every class gets one accent, picked from its id, so the same class is the same colour on
 * the dashboard card, the class page and the sidebar dot. The palette is cool hues only (blue, indigo, teal,
 * violet, slate, cyan); red, orange, amber, yellow and green are reserved for risk and health, which stay in the
 * text-and-icon pills. Every colour keeps white text at 4.5:1 or better (checked in classBand.test.ts), which also
 * makes it safe as text on a white background.
 */
export const CLASS_ACCENTS = [
  { name: "blue", color: "#1d4ed8" },
  { name: "indigo", color: "#4338ca" },
  { name: "teal", color: "#0f766e" },
  { name: "violet", color: "#6d28d9" },
  { name: "slate", color: "#334155" },
  { name: "cyan", color: "#0e7490" },
] as const;

export interface ClassAccent {
  name: (typeof CLASS_ACCENTS)[number]["name"];
  /** Solid colour for a header band, a dot or an accent rule; white text on it is at least 4.5:1. */
  color: string;
}

/** The accent of a class. Same id, same colour, on every screen; neighbouring ids get different colours. */
export function classAccent(classId: number): ClassAccent {
  const n = Number.isFinite(classId) ? Math.abs(Math.trunc(classId)) : 0;
  return CLASS_ACCENTS[n % CLASS_ACCENTS.length]!;
}
