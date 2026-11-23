import { kindOf } from "./instructionsCheck";
import type { AiBriefCheck } from "./aiReview";
import type { KeyMarks } from "./requirementMarks";

// The "Worked on by" line under a requirement of the project instructions check (instructor and leader).
// Shows who wrote the proof; never compares people and never reads or changes a score. Names arrive from the
// server already shortened ("Aldren B.") and sorted by name.

export const WORKED_ON_LABEL = "Worked on by";
export const NOT_KNOWN = "Not known.";
export const NOT_KNOWN_LEADER_MARK = "Not known. Marked by the leader.";
export const CONFIRMED_BY_INSTRUCTOR = "Confirmed by the instructor.";
export const NO_ONE_FOUND = "No one found yet.";
export const NO_ONE_FOUND_LEADER = "No one found yet. If your group did it, add it to the Docs or the repository.";
export const WORKED_ON_NOTE =
  "Shows who changed the files or wrote the Docs text shown as proof. It does not cover everyone who helped, and it is not a grade.";
export const MAX_CHIPS = 2;

export type WorkedOn =
  | { type: "names"; shown: string[]; more: number }
  | { type: "text"; text: string }
  | null;

type Req = AiBriefCheck["requirements"][number];

/**
 * What the line says. Names first (real proof). Otherwise the marks, which never invent a name. Otherwise the
 * two empty cases: the AI found it but no author could be matched ("Not known."), or nothing is covered
 * ("No one found yet."). Null (no line) when the server sent no `contributors` at all.
 */
export function workedOn(r: Req, instructor: boolean, keyMarks?: KeyMarks): WorkedOn {
  if (!r.contributors) return null;
  if (r.contributors.length > 0) {
    return { type: "names", shown: r.contributors.slice(0, MAX_CHIPS), more: Math.max(0, r.contributors.length - MAX_CHIPS) };
  }
  const kind = kindOf(r);
  if (kind !== "COVERED" && keyMarks?.instructor) return { type: "text", text: CONFIRMED_BY_INSTRUCTOR };
  if (kind !== "COVERED" && keyMarks?.leader?.status === "LEADER_CLAIM") return { type: "text", text: NOT_KNOWN_LEADER_MARK };
  if (kind === "COVERED" || kind === "PARTLY") return { type: "text", text: NOT_KNOWN };
  return { type: "text", text: instructor ? NO_ONE_FOUND : NO_ONE_FOUND_LEADER };
}

/** The long note behind the (i) in the check header. Three short sentences, opened by tap. */
export const CHECK_TIP_SENTENCES = [
  "The AI compared the work with the instructions and can be wrong.",
  "Names show who changed the proof files or wrote the Docs text, not everyone who helped.",
  "This is not a grade.",
];

/**
 * What a row shows. Names always. On a row that is not covered, only the two mark sentences (they say what the
 * instructor or the leader did). "No one found yet" and "Not known." are left out: nothing is shown instead.
 */
export function visibleWorkedOn(line: WorkedOn, kind: string): WorkedOn {
  if (!line) return null;
  if (line.type === "names") return line;
  return kind !== "COVERED" && (line.text === CONFIRMED_BY_INSTRUCTOR || line.text === NOT_KNOWN_LEADER_MARK) ? line : null;
}
