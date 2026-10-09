// Display helpers for the member drawer. Everything here reads values already stored in the report
// (plus the read-only weight constants from shared/); nothing recomputes scores, shares or flags.
import type { AnyScoredMember, DocumentScoredMember, ScoredMember } from "@shared/types";
import { FILE_WEIGHTS } from "@shared/fileWeights";
import {
  COMMIT_IMPACT, COSMETIC_MAX_TOTAL_LINES, STRUCTURAL_FILES_TOUCHED_THRESHOLD, STRUCTURAL_NEW_FILES_THRESHOLD,
  TRIVIAL_MAX_TOTAL_LINES,
} from "@shared/commitClassifier";
import { EDIT_TYPE_WEIGHT, REPLACE_RATIO_MAX, REPLACE_RATIO_MIN, SUBSTANTIVE_MIN_CHARS, TRIVIAL_MAX_CHARS } from "@shared/editClassifier";
import { docsStatsOf, githubStatsOf } from "./memberView";

export type WeightLabel = "High" | "Medium" | "Low" | "Very low";

export function weightLabel(w: number): WeightLabel {
  if (w >= 0.8) return "High";
  if (w >= 0.5) return "Medium";
  if (w >= 0.2) return "Low";
  return "Very low";
}

export type FileTypeKey = "source" | "test" | "style" | "docs" | "config" | "other";

export const FILE_TYPE_META: Record<FileTypeKey, { name: string; reason: string; color: string }> = {
  source: { name: "Source code", reason: "Production code earns full credit", color: "#4338ca" },
  test: { name: "Tests", reason: "Tests count, slightly below production code", color: "#0f766e" },
  style: { name: "Styles", reason: "Styling is real work but less logic-heavy", color: "#c2410c" },
  docs: { name: "Docs", reason: "Documentation is credited, at a lower rate than code", color: "#a21caf" },
  config: { name: "Config", reason: "Config files are mostly boilerplate", color: "#475569" },
  other: { name: "Other", reason: "Uncategorised files get a middle weight", color: "#a16207" },
};

const FILE_ORDER: FileTypeKey[] = ["source", "test", "style", "docs", "config", "other"];

export interface FileTypeRow {
  key: FileTypeKey;
  name: string;
  reason: string;
  color: string;
  lines: number;
  pct: number;
  weight: number;
  label: WeightLabel;
}

/** Rows for every file type with stored lines; null when the stored breakdown is missing or all zero. */
export function fileTypeRows(gh: ScoredMember | null): FileTypeRow[] | null {
  const b = gh?.fileTypeBreakdown;
  if (!b) return null;
  const total = FILE_ORDER.reduce((s, k) => s + (b[k] ?? 0), 0);
  if (total <= 0) return null;
  return FILE_ORDER.filter((k) => (b[k] ?? 0) > 0).map((key) => ({
    key,
    ...FILE_TYPE_META[key],
    lines: b[key],
    pct: (b[key] / total) * 100,
    weight: FILE_WEIGHTS[key],
    label: weightLabel(FILE_WEIGHTS[key]),
  }));
}

export type ImpactKey = keyof typeof COMMIT_IMPACT;
export const IMPACT_ORDER: ImpactKey[] = ["structural", "functional", "cosmetic", "trivial"];
export const IMPACT_LABEL: Record<ImpactKey, string> = {
  structural: "Structural", functional: "Functional", cosmetic: "Cosmetic", trivial: "Trivial",
};

/** Commit-impact counts, or null when missing or all zero. */
export function impactRows(gh: ScoredMember | null): Array<{ key: ImpactKey; label: string; count: number; multiplier: number }> | null {
  const b = gh?.commitImpactBreakdown;
  if (!b) return null;
  if (IMPACT_ORDER.reduce((s, k) => s + (b[k] ?? 0), 0) <= 0) return null;
  return IMPACT_ORDER.map((key) => ({ key, label: IMPACT_LABEL[key], count: b[key] ?? 0, multiplier: COMMIT_IMPACT[key] }));
}

/** Number of commits the impact breakdown covers (0 when missing). */
export function impactTotal(gh: ScoredMember | null): number {
  const b = gh?.commitImpactBreakdown;
  return b ? IMPACT_ORDER.reduce((s, k) => s + (b[k] ?? 0), 0) : 0;
}

export type EditKey = "substantive" | "revision" | "formatting" | "trivial";
export const EDIT_ORDER: EditKey[] = ["substantive", "revision", "formatting", "trivial"];
export const EDIT_MULTIPLIER: Record<EditKey, number> = { substantive: 1.0, revision: 0.7, formatting: 0.3, trivial: 0.1 };
export const EDIT_LABEL: Record<EditKey, string> = {
  substantive: "Substantive", revision: "Revision", formatting: "Formatting", trivial: "Trivial",
};

/** One or two plain sentences per commit-impact category, built from the classifier's own constants. */
export const IMPACT_TIP: Record<ImpactKey, string> = {
  structural: `Creates ${STRUCTURAL_NEW_FILES_THRESHOLD} or more new files, or touches ${STRUCTURAL_FILES_TOUCHED_THRESHOLD} or more files in one commit. Counted at ${COMMIT_IMPACT.structural.toFixed(1)}×.`,
  functional: `A substantive change to source or test files that isn't structural or cosmetic. Counted at ${COMMIT_IMPACT.functional.toFixed(1)}×.`,
  cosmetic: `Touches no source or test files, or is a small edit (under ${COSMETIC_MAX_TOTAL_LINES} lines) with roughly equal lines added and removed. Counted at ${COMMIT_IMPACT.cosmetic.toFixed(1)}×.`,
  trivial: `Changes ${TRIVIAL_MAX_TOTAL_LINES} lines or fewer and touches no source or test files. Counted at ${COMMIT_IMPACT.trivial.toFixed(1)}×.`,
};

/** Same for Docs edit-significance categories, from editClassifier.ts. */
export const EDIT_TIP: Record<EditKey, string> = {
  substantive: `New text of ${SUBSTANTIVE_MIN_CHARS}+ characters with nothing removed, or a larger rewrite that isn't similar in size to the text it replaced. Counted at ${EDIT_TYPE_WEIGHT.substantive.toFixed(1)}×.`,
  revision: `A shorter addition (under ${SUBSTANTIVE_MIN_CHARS} characters) or a rewrite that noticeably changes the size of the text. Counted at ${EDIT_TYPE_WEIGHT.revision.toFixed(1)}×.`,
  formatting: `Replaces text with a similar amount (new text ${REPLACE_RATIO_MIN}–${REPLACE_RATIO_MAX}× the length of what was removed), such as reordering or spacing touch-ups. Counted at ${EDIT_TYPE_WEIGHT.formatting.toFixed(1)}×.`,
  trivial: `An edit of ${TRIVIAL_MAX_CHARS} characters or fewer in total, such as punctuation or a single-character fix. Counted at ${EDIT_TYPE_WEIGHT.trivial.toFixed(1)}×.`,
};

export const PREDATES_MESSAGE = "this report predates detailed breakdowns. Re-analyze to see them.";

function githubSummary(gh: ScoredMember): string | null {
  const parts: string[] = [];
  const rows = fileTypeRows(gh);
  if (rows) {
    const top = [...rows].sort((a, b) => b.lines - a.lines)[0];
    const phrase = top.pct >= 50 ? `Mostly ${top.name.toLowerCase()}` : `Mainly ${top.name.toLowerCase()}`;
    parts.push(`${phrase} (${Math.round(top.pct)}% of added lines)`);
  }
  // Same basis as the Commit impact section: the commits actually analyzed, so the numbers can't contradict.
  const analyzed = impactTotal(gh);
  const structural = gh.commitImpactBreakdown?.structural ?? 0;
  const commits = analyzed > 0
    ? `${analyzed} commit${analyzed === 1 ? "" : "s"} analyzed`
    : `${gh.commits} commit${gh.commits === 1 ? "" : "s"}`;
  parts.push(structural > 0 ? `${commits}, ${structural} structural` : commits);
  return parts.join(" · ");
}

function docsSummary(d: DocumentScoredMember): string {
  const parts: string[] = [];
  const b = d.editTypeBreakdown;
  const total = b ? EDIT_ORDER.reduce((s, k) => s + (b[k] ?? 0), 0) : 0;
  if (b && total > 0) {
    const top = [...EDIT_ORDER].sort((x, y) => b[y] - b[x])[0];
    parts.push(`Mostly ${top} edits (${b[top]} of ${total})`);
  }
  parts.push(`${d.sessionCount} session${d.sessionCount === 1 ? "" : "s"}`);
  parts.push(`${d.retainedChars.toLocaleString()} characters kept`);
  return parts.join(" · ");
}

export interface ScoreSummary {
  /** Semibold lead phrase (first segment). */
  lead: string;
  rest: string;
}

/** One-line "what drove the score", from stored values only. */
export function scoreDriverSummary(m: AnyScoredMember): ScoreSummary | null {
  const gh = githubStatsOf(m);
  const docs = docsStatsOf(m);
  const segments: string[] = [];
  if (gh) { const s = githubSummary(gh); if (s) segments.push(s); }
  if (docs) segments.push(docsSummary(docs));
  if (segments.length === 0) return null;
  const full = segments.join(" · ");
  const idx = full.indexOf(" (");
  const leadEnd = idx > 0 ? idx : full.indexOf(" · ") > 0 ? full.indexOf(" · ") : full.length;
  return { lead: full.slice(0, leadEnd), rest: full.slice(leadEnd) };
}

// Per-user remembered open/closed state for drawer sections. Storage can be unavailable or throw.
const prefKey = (userId: number | null, section: string) => `ft_member_drawer:${userId ?? "anon"}:${section}`;

export function readSectionOpen(userId: number | null, section: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(prefKey(userId, section));
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function writeSectionOpen(userId: number | null, section: string, open: boolean): void {
  try {
    window.localStorage.setItem(prefKey(userId, section), open ? "1" : "0");
  } catch {
    /* storage unavailable — state is not persisted */
  }
}
