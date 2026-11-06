// Display only: plain-words "how this was counted" text for one member. Every number comes from data the
// report already stores; nothing here is read by scoring. Weights quoted here come from the shared constants.
import { LINE_TYPE_WEIGHTS } from "@shared/lineClassifier";

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
const here = (v: number | null | undefined, unit = "") => (positive(v) ? ` (${n(v)}${unit} here)` : "");
// The stored self-churn ratio is rounded to 3 decimals, so a count rebuilt from it is an estimate.
const about = (v: number | null | undefined, unit = "") => (positive(v) ? ` (about ${n(v)}${unit})` : "");

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
        { label: "Counted", text: "Code lines at full weight. Commits, with line detail read for up to 100 per member." },
        {
          label: "Counted less",
          text:
            `Comment lines count ${LINE_TYPE_WEIGHTS.comment === 0.25 ? "a quarter" : `${LINE_TYPE_WEIGHTS.comment}×`}${here(input.github.commentLines)}. ` +
            "Test, style, docs and config files count less than source files. " +
            `Lines ${who} later deleted ${input.voice === "you" ? "yourself" : "themselves"} lower the total, by up to half.`,
        },
        {
          label: "Not counted",
          text:
            `Blank lines${here(input.github.blankLines)}. ` +
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
        { label: "Counted", text: `Text ${who} wrote that is still in the document${here(d.retainedChars, " characters")}.` },
        {
          label: "Counted less",
          text:
            "Formatting and trivial edits. " +
            `Text ${who} later deleted ${input.voice === "you" ? "yourself" : "themselves"}${about(deleted, " characters")}.` +
            (positive(d.importedChars) ? " Imported .docx text, which counts as an estimate." : ""),
        },
        {
          label: "Not counted",
          text: `Bold, headings and other formatting-only changes. Inserted images${here(d.images)}, which are shown but never scored.`,
        },
      ],
    });
  }

  const footer: string[] = [];
  if (positive(input.rulesVersion)) footer.push(`Scoring rules version ${input.rulesVersion}.`);
  footer.push(OUTSIDE_WORK_LINE);
  return { blocks, footer };
}
