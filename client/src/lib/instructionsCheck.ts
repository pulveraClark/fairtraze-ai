import type { AiBriefCheck } from "./aiReview";

// Wording and ordering for the "Project instructions check" card, kept out of the component so it can be
// tested on its own. Display only: nothing here is a score, and the server decides who sees the card.

export type RequirementKind = "COVERED" | "PARTLY" | "NOT_COVERED" | "CHECK";
type Requirement = AiBriefCheck["requirements"][number];

/** A requirement whose proof could not be confirmed is "check", not "not covered". */
export function kindOf(r: Requirement): RequirementKind {
  if (r.unverified) return "CHECK";
  if (r.status === "FOUND") return "COVERED";
  return r.status === "PARTLY_FOUND" ? "PARTLY" : "NOT_COVERED";
}

/** The items the reader may want to look at first, in this order. */
export const ATTENTION_ORDER: RequirementKind[] = ["PARTLY", "NOT_COVERED", "CHECK"];

export const PILL: Record<RequirementKind, { icon: string; cls: string }> = {
  COVERED: { icon: "✓", cls: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  PARTLY: { icon: "◐", cls: "border-amber-300 bg-amber-50 text-amber-950" },
  NOT_COVERED: { icon: "○", cls: "border-slate-300 bg-slate-100 text-slate-900" },
  CHECK: { icon: "?", cls: "border-slate-300 bg-slate-100 text-slate-900" },
};

/** The instructor "needs your check"; the leader and students read "not clear yet". */
export function pillLabel(kind: RequirementKind, instructor: boolean): string {
  switch (kind) {
    case "COVERED": return "Covered";
    case "PARTLY": return "Partly covered";
    case "NOT_COVERED": return "Not covered yet";
    case "CHECK": return instructor ? "Needs your check" : "Not clear yet";
  }
}

export type KindCounts = Record<RequirementKind, number>;

export function countKinds(requirements: Requirement[]): KindCounts {
  const counts: KindCounts = { COVERED: 0, PARTLY: 0, NOT_COVERED: 0, CHECK: 0 };
  for (const r of requirements) counts[kindOf(r)]++;
  return counts;
}

/** "12 of 13 requirements are covered in the work." / "All 13 requirements are covered in the work." */
export function coveredSentence(covered: number, total: number): string {
  if (total === 1) return covered === 1 ? "The requirement is covered in the work." : "0 of 1 requirement is covered in the work.";
  if (covered === total) return `All ${total} requirements are covered in the work.`;
  return `${covered} of ${total} requirements are covered in the work.`;
}

/** "1 partly covered, 2 not covered yet, 1 needs your check." Zeros are left out; null when nothing remains. */
export function otherCountsSentence(counts: KindCounts, instructor: boolean): string | null {
  const parts: string[] = [];
  if (counts.PARTLY) parts.push(`${counts.PARTLY} partly covered`);
  if (counts.NOT_COVERED) parts.push(`${counts.NOT_COVERED} not covered yet`);
  if (counts.CHECK) parts.push(`${counts.CHECK} ${instructor ? "needs your check" : "not clear yet"}`);
  return parts.length > 0 ? `${parts.join(", ")}.` : null;
}

export function coveredToggleLabel(shown: boolean, covered: number): string {
  return `${shown ? "Hide" : "Show"} the ${covered} covered requirement${covered === 1 ? "" : "s"}`;
}

export function droppedSentence(count: number): string {
  return count === 1
    ? "1 item the AI listed was not found in the project instructions and was left out."
    : `${count} items the AI listed were not found in the project instructions and were left out.`;
}

/** Which activity the AI compared, by the group's source type (the exact sentence when it is not known). */
export function comparedSentence(sourceType: string | null | undefined): string {
  const activity = sourceType === "GITHUB" ? "GitHub" : sourceType === "EDITOR" ? "Docs" : "GitHub and Docs";
  return `The AI compared the members' ${activity} activity with the project instructions. It can make mistakes, so check anything important. This is not a grade.`;
}

export const NO_INSTRUCTIONS_LINE =
  "Project instructions check · no instructions added yet. Add the project instructions to compare the work with them.";

/** The hash that carries the sentence to highlight to the page that shows the instructions. */
export function highlightHash(quote: string): string {
  return `#highlight=${encodeURIComponent(quote)}`;
}

/** The sentence to highlight from a location hash, or null. Kept in the hash so it never reaches a server log. */
export function highlightFromHash(hash: string): string | null {
  const m = /^#highlight=(.*)$/.exec(hash);
  if (!m) return null;
  try {
    const q = decodeURIComponent(m[1]!).trim();
    return q ? q.slice(0, 400) : null;
  } catch {
    return null;
  }
}

// ── What the AI read (from check.sources) ──────────────────────────────────────────────────────────

type Sources = NonNullable<AiBriefCheck["sources"]>;
type Skipped = Sources["skipped"][number];

const isPdfName = (name: string) => /\.pdf$/i.test(name);
const isImageName = (name: string) => /\.(png|jpe?g|webp)$/i.test(name);

/** "The AI read: ..." for the files it read; null for older checks and when it read only the written text. */
export function readLine(sources: Sources | undefined): string | null {
  if (!sources || sources.filesRead <= 0) return null;
  const files = `${sources.filesRead} attached file${sources.filesRead === 1 ? "" : "s"}`;
  return sources.writtenBrief
    ? `The AI read: the written instructions and ${files}.`
    : `The AI read: ${files}. No written instructions were added.`;
}

/**
 * One plain sentence for a file that was not read. The size and count limits depend on the kind of file
 * (a PDF may be 5 MB, an image 1 MB; one PDF, three images), which is told from the file name.
 */
export function skippedLine(s: Skipped): string {
  const name = s.filename;
  switch (s.reason) {
    case "TOO_LARGE":
      return `${name} was too large (over ${isPdfName(name) ? "5 MB" : isImageName(name) ? "1 MB" : "the size limit"}) and was skipped.`;
    case "TOO_MANY_PAGES": return `${name} has too many pages (over 20) and was skipped.`;
    case "UNSUPPORTED": return `${name} is not a supported type and was skipped.`;
    case "UNREADABLE": return `${name} could not be read.`;
    case "TOO_MANY_FILES":
      return isPdfName(name) ? `${name} was not read: only one PDF is read.` : `${name} was not read: only the first 3 images are read.`;
    case "TOTAL_TOO_LARGE": return `${name} was not read: the files together are over 6 MB.`;
  }
}

export const SKIPPED_NOT_CHECKED = "Requirements in skipped files were not checked.";
export const SCANNED_NOTE = "Scanned pages may be read less accurately.";
export const NOTHING_READ_TITLE = "Project instructions check · nothing could be read.";

export function nothingReadAdvice(instructor: boolean): string {
  return instructor
    ? "Add the project instructions as text, or attach a smaller file."
    : "Ask your instructor to add the project instructions as text, or attach a smaller file.";
}
