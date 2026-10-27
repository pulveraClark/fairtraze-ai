import { createHash } from "node:crypto";
import { indexOfQuote, normalizeInstructions, normalizeQuote } from "@shared/quoteMatch.js";

// "We have this" marks (RequirementMark). Context only: nothing here is read by scoring, flags, Gini, team
// health or any AI prompt.

export const MARK_NOTE_MAX = 140;
export const MARK_IMAGE_MAX_BYTES = 1024 * 1024;

interface Source {
  sourceQuote?: string | null;
  sourceFile?: string | null;
  sourcePage?: number | null;
}

/**
 * A requirement's key: a hash of where it comes from (the verified sentence of the instructions, normalised, or
 * the attached file and page), never of the AI's wording. Regenerate rewords requirements but keeps their source,
 * so a mark stays on its requirement. Null for an old check that has no source.
 */
export function requirementKey(r: Source): string | null {
  const basis = sourceBasis(r);
  return basis ? hashKey(basis) : null;
}

function sourceBasis(r: Source): string | null {
  const quote = (r.sourceQuote ?? "").trim();
  const file = (r.sourceFile ?? "").trim().toLowerCase();
  if (!quote && !file) return null;
  return quote ? `q:${normalizeQuote(quote)}` : `f:${file}#${r.sourcePage ?? ""}`;
}

const hashKey = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/**
 * Keys for a whole check, in order. One sentence of the instructions can give several requirements; a
 * requirement alone on its sentence keeps the plain `requirementKey`, and siblings that share a sentence get the
 * sentence plus their own normalised text, so each key belongs to one item (never to its position). If the AI
 * rewords a sibling, its old mark no longer matches and reads stale; it is never moved to another item.
 */
export function requirementKeys(rs: Array<Source & { text: string }>): Array<string | null> {
  const bases = rs.map(sourceBasis);
  const counts = new Map<string, number>();
  for (const b of bases) if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  return rs.map((r, i) => {
    const b = bases[i];
    if (!b) return null;
    return counts.get(b)! > 1 ? hashKey(`${b}|t:${normalizeQuote(r.text)}`) : hashKey(b);
  });
}

/**
 * True when the part of the instructions a mark was made for is gone: its sentence is no longer in the written
 * instructions, or its attached file is no longer attached. Marks on unchanged requirements stay current.
 */
export function isMarkStale(
  mark: Source,
  current: { description: string; attachmentNames: string[] },
): boolean {
  const quote = (mark.sourceQuote ?? "").trim();
  if (quote) {
    return indexOfQuote(normalizeInstructions(current.description), normalizeQuote(quote), false) === -1;
  }
  const file = (mark.sourceFile ?? "").trim().toLowerCase();
  if (file) return !current.attachmentNames.some((n) => n.toLowerCase() === file);
  return true;
}

/** A note of at most 140 characters, or null when blank. */
export function cleanNote(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, MARK_NOTE_MAX) : null;
}
