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

export interface LookItem { text: string; kind: Exclude<RequirementKind, "COVERED">; req: Req }

export interface InstructionsSummary {
  /** Every requirement the AI listed (after its quotes were verified). */
  total: number;
  /** Covered: the AI found it, or the instructor confirmed it. Leader claims never count. */
  found: number;
  /** total - found: the items in the "Needs a look" box. */
  needCheck: number;
  /** Every open item, not covered first, then "check", then partly covered. The box shows the first 2. */
  look: LookItem[];
}

const LOOK_ORDER: LookItem["kind"][] = ["NOT_COVERED", "CHECK", "PARTLY"];

/** The one place the counts come from, so "N of M" in the box and "k covered" on the row always add up to M. */
export function instructionsSummary(requirements: Req[], marks: RequirementMark[] = []): InstructionsSummary {
  const confirmed = confirmedKeys(marks);
  const open: LookItem[] = [];
  let found = 0;
  for (const r of requirements) {
    const kind = kindOf(r);
    if (kind === "COVERED" || (r.key && confirmed.has(r.key))) found++;
    else open.push({ text: r.text, kind: kind as LookItem["kind"], req: r });
  }
  const sorted = LOOK_ORDER.flatMap((k) => open.filter((i) => i.kind === k));
  return { total: requirements.length, found, needCheck: open.length, look: sorted };
}

/** "Needs a look (2 of 9)". */
export const needsLookTitle = (n: number, total: number) => `Needs a look (${n} of ${total})`;
/** "6 covered requirements, with proof". */
export const coveredProofTitle = (k: number) => `${k} covered requirement${k === 1 ? "" : "s"}, with proof`;
