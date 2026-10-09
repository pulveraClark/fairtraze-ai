// Display helpers for the member drawer. Everything here reads values already stored in the report
// (plus the read-only weight constants from shared/); nothing recomputes scores, shares or flags.
import type { AnyScoredMember, DocumentScoredMember, ScoredMember } from "@shared/types";
import { FILE_WEIGHTS } from "@shared/fileWeights";
import { COMMIT_IMPACT } from "@shared/commitClassifier";
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

export type EditKey = "substantive" | "revision" | "formatting" | "trivial";
export const EDIT_ORDER: EditKey[] = ["substantive", "revision", "formatting", "trivial"];
export const EDIT_MULTIPLIER: Record<EditKey, number> = { substantive: 1.0, revision: 0.7, formatting: 0.3, trivial: 0.1 };
export const EDIT_LABEL: Record<EditKey, string> = {
  substantive: "Substantive", revision: "Revision", formatting: "Formatting", trivial: "Trivial",
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
  const commits = `${gh.commits} commit${gh.commits === 1 ? "" : "s"}`;
  const structural = gh.commitImpactBreakdown?.structural ?? 0;
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
