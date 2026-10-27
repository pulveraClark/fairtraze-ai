import type { TeamHealth } from "@shared/types";
import type { AiBriefCheck } from "./aiReview";
import { kindOf, type RequirementKind } from "./instructionsCheck";
import type { RequirementMark } from "./requirementMarks";

// The short summary on top of the instructor's AI findings card. Built only from results that already exist
// (the code-computed team health, the verified instructions check and the instructor's marks). Counts and named
// requirements only: no grade, percentage or rating. Display only.

type Req = AiBriefCheck["requirements"][number];

/** One plain sentence for the code-computed health label. No Gini number. */
export function healthSentence(health: TeamHealth): string {
  switch (health) {
    case "Healthy": return "Work is shared very evenly.";
    case "Moderate Risk": return "Work is shared somewhat unevenly.";
    case "High Risk": return "Work is shared unevenly.";
  }
}

/** Only a current (not stale) INSTRUCTOR_CONFIRMED mark counts. A waiting or declined leader claim never does. */
function confirmedKeys(marks: RequirementMark[]): Set<string> {
  return new Set(
    marks.filter((m) => !m.stale && m.role === "INSTRUCTOR" && m.status === "INSTRUCTOR_CONFIRMED").map((m) => m.requirementKey),
  );
}

export interface LookItem { text: string; kind: Exclude<RequirementKind, "COVERED"> }

export interface InstructionsSummary {
  total: number;
  found: number;
  needCheck: number;
  line: string;
  /** At most 2: not covered first, then "check", then partly covered. */
  look: LookItem[];
  more: number;
}

const LOOK_ORDER: LookItem["kind"][] = ["NOT_COVERED", "CHECK", "PARTLY"];

export function instructionsSummary(requirements: Req[], marks: RequirementMark[] = []): InstructionsSummary {
  const confirmed = confirmedKeys(marks);
  const open: LookItem[] = [];
  let found = 0;
  for (const r of requirements) {
    const kind = kindOf(r);
    if (kind === "COVERED" || (r.key && confirmed.has(r.key))) found++;
    else open.push({ text: r.text, kind: kind as LookItem["kind"] });
  }
  const total = requirements.length;
  const needCheck = open.length;
  const sorted = LOOK_ORDER.flatMap((k) => open.filter((i) => i.kind === k));
  const line = needCheck === 0
    ? `Instructions: ${found} of ${total} found in the work. Nothing needs your check.`
    : `Instructions: ${found} of ${total} found in the work · ${needCheck} need${needCheck === 1 ? "s" : ""} your check`;
  return { total, found, needCheck, line, look: sorted.slice(0, 2), more: Math.max(0, sorted.length - 2) };
}
