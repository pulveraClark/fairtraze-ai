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

export interface CountedGroup {
  label: "Counted" | "Counted less" | "Not counted";
  text: string;
}
export interface CountedBlock {
  source: "GitHub" | "FairTraze Docs";
  groups: CountedGroup[];
}
export interface HowCountedModel {
  blocks: CountedBlock[];
  footer: string[];
}

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
  const blocks: CountedBlock[] = [];

  if (input.github) {
    blocks.push({
      source: "GitHub",
      groups: [
        { label: "Counted", text: "Code lines at full weight, and commits. Line counts come from up to 100 commits per member." },
        {
          label: "Counted less",
          text:
            `Comment lines count ${LINE_TYPE_WEIGHTS.comment === 0.25 ? "a quarter" : `${LINE_TYPE_WEIGHTS.comment}×`}${count(input.github.commentLines, "lines")}. ` +
            "Test, style, docs and config files count less than source files. " +
            `Lines ${who} later deleted ${input.voice === "you" ? "yourself" : "themselves"} lower the total, by up to half.`,
        },
        {
          label: "Not counted",
          text:
            `Blank lines${count(input.github.blankLines, "lines")}. ` +
            "Generated files such as lock files and build output (GitHub's raw line totals still include them). Merge commits.",
        },
      ],
    });
  }

  if (input.docs) {
    const d = input.docs;
    const deleted = selfDeletedChars(d.selfChurnRatio, d.totalInsertedChars);
    blocks.push({
      source: "FairTraze Docs",
      groups: [
        { label: "Counted", text: `Text ${who} wrote that is still in the document${count(d.retainedChars, "characters")}.` },
        {
          label: "Counted less",
          text:
            `Small wording and spacing edits count about ${pct(EDIT_TYPE_WEIGHT.formatting)} and tiny edits about ${pct(EDIT_TYPE_WEIGHT.trivial)}. ` +
            `Text ${who} later deleted ${input.voice === "you" ? "yourself" : "themselves"}${about(deleted, "characters")}.` +
            (positive(d.importedChars) ? " Text imported from a Word file is counted by an estimate." : ""),
        },
        {
          label: "Not counted",
          // No per-project image credit exists: inserted images are disclosed, never scored (see CLAUDE.md "Image insertion").
          text: "Style changes that leave the text the same, such as bold or headings. Images are shown but not scored.",
        },
      ],
    });
  }

  const footer: string[] = [];
  if (positive(input.rulesVersion)) footer.push(`Scoring rules version ${input.rulesVersion}.`);
  footer.push(OUTSIDE_WORK_LINE);
  return { blocks, footer };
}
