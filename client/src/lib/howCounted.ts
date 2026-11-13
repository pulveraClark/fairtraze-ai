// Display only: plain-words "how this was counted" text for one member. Every number comes from data the
// report already stores; nothing here is read by scoring. Weights quoted here come from the shared constants.
import { LINE_TYPE_WEIGHTS } from "@shared/lineClassifier";
import { EDIT_TYPE_WEIGHT } from "@shared/editClassifier";

export const OUTSIDE_WORK_LINE = "Work outside GitHub and FairTraze Docs is not counted.";

export type CountedVoice = "member" | "you";

export interface HowCountedInput {
  /** "you" for a student's own window, "member" for the instructor's window. */
  voice: CountedVoice;
  /** Present when GitHub is a source for this member. */
  github: { commentLines?: number | null; blankLines?: number | null } | null;
  /** Present when Docs is a source for this member. */
  docs: {
    selfChurnRatio?: number | null;
    totalInsertedChars?: number | null;
    retainedChars?: number | null;
    importedChars?: number | null;
    images?: number | null;
  } | null;
  /** Scoring rules version stored with the report, when known. */
  rulesVersion?: number | null;
}

export type CountedTone = "full" | "less" | "none";
export interface CountedGroup {
  label: "Counts fully" | "Counts less" | "Does not count";
  /** Shown beside the label so colour is never the only signal. */
  symbol: "✓" | "↓" | "✕";
  tone: CountedTone;
  /** One short line each. */
  items: string[];
}
export interface CountedBlock {
  source: "GitHub" | "FairTraze Docs";
  /** Small note under the source heading. */
  note?: string;
  groups: CountedGroup[];
}
export interface HowCountedModel {
  blocks: CountedBlock[];
  footer: string[];
}

export const GITHUB_SAMPLE_NOTE =
  "Lines are counted from each member's 100 most recent commits. Commits and active days use the full history.";

const n = (v: number) => v.toLocaleString("en-US");
const positive = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const count = (v: number | null | undefined, unit: string) => (positive(v) ? ` (${n(v)} ${unit})` : "");
const pct = (w: number) => `${Math.round(w * 100)}%`;
// The stored self-churn ratio is rounded to 3 decimals, so a count rebuilt from it is an estimate.
const about = (v: number | null | undefined, unit: string) => (positive(v) ? ` (about ${n(v)} ${unit})` : "");

/** Characters a member wrote and later deleted themselves, from the stored ratio and inserted total. */
export function selfDeletedChars(ratio: number | null | undefined, inserted: number | null | undefined): number {
  if (!positive(ratio) || !positive(inserted)) return 0;
  return Math.round(ratio * inserted);
}

export function howCounted(input: HowCountedInput): HowCountedModel {
  const who = input.voice === "you" ? "you" : "the member";
  const self = input.voice === "you" ? "yourself" : "themselves";
  const blocks: CountedBlock[] = [];
  const group = (tone: CountedTone, items: string[]): CountedGroup =>
    tone === "full"
      ? { label: "Counts fully", symbol: "✓", tone, items }
      : tone === "less"
        ? { label: "Counts less", symbol: "↓", tone, items }
        : { label: "Does not count", symbol: "✕", tone, items };

  if (input.github) {
    blocks.push({
      source: "GitHub",
      note: GITHUB_SAMPLE_NOTE,
      groups: [
        group("full", ["Code lines at full weight", "Commits"]),
        group("less", [
          `Comment lines count ${pct(LINE_TYPE_WEIGHTS.comment)}${count(input.github.commentLines, "lines")}`,
          "Test, style, docs and config files count less than source files",
          `Lines ${who} later deleted ${self} lower the total, by up to ${pct(0.5)}`,
        ]),
        group("none", [
          `Blank lines${count(input.github.blankLines, "lines")}`,
          "Auto-generated files (for example lock files)",
          "Merge commits",
        ]),
      ],
    });
  }

  if (input.docs) {
    const d = input.docs;
    const deleted = selfDeletedChars(d.selfChurnRatio, d.totalInsertedChars);
    blocks.push({
      source: "FairTraze Docs",
      groups: [
        group("full", [`Text ${who} wrote that is still in the document${count(d.retainedChars, "characters")}`]),
        group("less", [
          `Small wording and spacing edits count about ${pct(EDIT_TYPE_WEIGHT.formatting)}`,
          `Tiny edits count about ${pct(EDIT_TYPE_WEIGHT.trivial)}`,
          `Text ${who} later deleted ${self}${about(deleted, "characters")}`,
          ...(positive(d.importedChars) ? ["Text imported from a Word file is counted by an estimate"] : []),
          // Same sentence for every member and without any size rule: students never see thresholds.
          "Images count a little, up to a limit your instructor sets",
        ]),
        group("none", [
          "Style changes that leave the text the same, such as bold or headings",
          "Copies of the same image and very small images",
        ]),
      ],
    });
  }

  const footer: string[] = [];
  if (positive(input.rulesVersion)) footer.push(`Scoring rules v${input.rulesVersion}.`);
  footer.push(OUTSIDE_WORK_LINE);
  return { blocks, footer };
}
