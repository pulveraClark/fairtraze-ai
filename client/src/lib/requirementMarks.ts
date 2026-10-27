import { kindOf } from "./instructionsCheck";
import type { AiBriefCheck } from "./aiReview";

// "We have this" marks on a project-instructions requirement the AI could not confirm. The server decides who may
// mark and who may see (leader, owning instructor, group members); this file only shapes what it sends.
// A leader claim never counts as covered until the instructor confirms. Display only: no scoring effect.

export type MarkRole = "LEADER" | "INSTRUCTOR";
export type MarkStatus = "LEADER_CLAIM" | "LEADER_CLAIM_DECLINED" | "INSTRUCTOR_CONFIRMED";

export interface RequirementMark {
  id: number;
  requirementKey: string;
  requirementText: string;
  role: MarkRole;
  status: MarkStatus;
  note: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  markedBy: { id: number; name: string };
  markedByYou: boolean;
  createdAt: string;
  updatedAt: string;
  // The sentence the mark was made for is gone from the current instructions.
  stale: boolean;
}

export const MARK_NOTE_MAX = 140;

export const LEADER_WAITING = "You said this is covered. Waiting for the instructor.";
export const LEADER_DECLINED = "The instructor has not accepted this yet. You can add a note or a picture.";
export const INSTRUCTOR_WAITING = "Leader says this is covered. Waiting for you";
export const MARK_STALE = "Instructions changed. Please check again.";

export interface KeyMarks {
  leader?: RequirementMark;
  instructor?: RequirementMark;
}

/** Current (not stale) marks by requirement key. */
export function marksByKey(marks: RequirementMark[]): Map<string, KeyMarks> {
  const out = new Map<string, KeyMarks>();
  for (const m of marks) {
    if (m.stale) continue;
    const cur = out.get(m.requirementKey) ?? {};
    if (m.role === "LEADER") cur.leader = m;
    else cur.instructor = m;
    out.set(m.requirementKey, cur);
  }
  return out;
}

/** One entry per requirement key whose instructions changed, newest mark first. */
export function staleMarks(marks: RequirementMark[]): RequirementMark[] {
  const seen = new Set<string>();
  return [...marks]
    .filter((m) => m.stale)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((m) => (seen.has(m.requirementKey) ? false : (seen.add(m.requirementKey), true)));
}

type Req = AiBriefCheck["requirements"][number];

/** Items the AI did not mark covered that the instructor confirmed. A leader claim alone never counts. */
export function confirmedByInstructor(requirements: Req[], marks: RequirementMark[]): number {
  const by = marksByKey(marks);
  return requirements.filter((r) => kindOf(r) !== "COVERED" && !!r.key && !!by.get(r.key)?.instructor).length;
}

/** "12 of 13 covered by the AI, 1 confirmed by the instructor." */
export function coveredByAiSentence(aiCovered: number, total: number, confirmed: number): string {
  return `${aiCovered} of ${total} covered by the AI, ${confirmed} confirmed by the instructor.`;
}

/** Leader claims still waiting for the instructor (a declined claim is not waiting). */
export function waitingClaims(marks: RequirementMark[]): number {
  return marks.filter((m) => !m.stale && m.role === "LEADER" && m.status === "LEADER_CLAIM").length;
}

export function markDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Small amber note on a row whose earlier mark no longer applies because the instructions changed. */
export const STALE_ROW_NOTE = "Instructions changed since your mark. Check again.";

/** The requirement as quoted in a sentence: no trailing full stop, so the sentence does not end in `.”.`. */
const quotedText = (text: string) => text.trim().replace(/[\s.]+$/, "");

/** One line for a stale mark whose requirement is no longer in the check, worded by who made the mark. */
export function staleOrphanLine(m: RequirementMark): string {
  const who = m.role === "INSTRUCTOR" ? "Your mark" : "The leader's claim";
  return `Instructions changed. ${who} on “${quotedText(m.requirementText)}” no longer applies.`;
}
