import { createHash } from "node:crypto";
import type { AiBriefEvidence, AiBriefRequirement } from "@shared/aiReviewTypes.js";
import type { AuthorshipSpan } from "../../collab/authorshipMap.js";
import type { DocPiece } from "./docsEvidence.js";
import { indexOfQuote, normalizeInstructions, normalizeQuote } from "@shared/quoteMatch.js";
import { skipReason } from "./skipRules.js";
import type { RawRequirement } from "./prompts.js";

// Pure helpers for the brief check: what is sent, within which limits, and how the answer is verified.

export const MAX_TREE_PATHS = 300;
export const MAX_KEY_FILES = 12;
export const KEY_FILE_CHARS = 2000;
export const DOC_TOTAL_CHARS = 12_000;
export const DOC_SECTION_CHARS = 600;
export const BRIEF_INPUT_MAX_CHARS = 60_000;
export const MAX_REQUIREMENTS = 15;
export const MAX_QUOTE_CHARS = 120;
export const NO_HEADING = "(before the first heading)";

export function briefHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 32);
}

/**
 * What the brief check was run on: the written brief plus the attachments' metadata (never their bytes), in
 * display order. With no attachments it equals `briefHash`, so older stored checks stay current. A replaced
 * file is a new row (new id), so adding, removing or replacing a file changes it. Skipped files count too.
 */
export function briefFingerprint(description: string, attachments: Array<{ id: number; size: number; mime: string }>): string {
  if (attachments.length === 0) return briefHash(description);
  const h = createHash("sha256").update(description.trim());
  for (const a of attachments) h.update(`\n${a.id}:${a.size}:${a.mime}`);
  return h.digest("hex").slice(0, 32);
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// A line that only brings a library in (import, from x import y, require, #include, using, use).
const IMPORT_LINE = /^\s*(import\b|from\s+\S+\s+import\b|(const|let|var)\s+.*=\s*require\(|#include\b|using\s+[\w.]+;|use\s+[\w:]+;)/i;

/** True when every non-empty line of the quote is an import: that proves a library is used, not the feature. */
export function isImportOnly(quote: string): boolean {
  const lines = quote.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.length > 0 && lines.every((l) => IMPORT_LINE.test(l));
}

/** Paths worth sending as a list: skip rules applied, shallow first, capped. */
export function selectTreePaths(paths: string[]): string[] {
  return paths
    .filter((p) => skipReason(p, { hasPatch: true }) === null)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, MAX_TREE_PATHS);
}

/** README first, then the files the group added the most lines to, only those that exist in the tree. */
export function selectKeyFiles(treePaths: string[], addedByPath: Map<string, number>): string[] {
  const allowed = new Set(treePaths);
  const readme = treePaths.find((p) => /^readme(\.[a-z]+)?$/i.test(p));
  const ranked = [...addedByPath.entries()]
    .filter(([p]) => allowed.has(p) && p !== readme)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p);
  return [...(readme ? [readme] : []), ...ranked].slice(0, MAX_KEY_FILES);
}

export interface DocSection {
  heading: string;
  // The text actually sent (shortened once the budget is used up).
  text: string;
}

/** Whole document for the prompt: headings in order, section text shortened to fit the budget. */
export function buildDocSections(pieces: DocPiece[], total = DOC_TOTAL_CHARS, perSection = DOC_SECTION_CHARS): DocSection[] {
  const order: string[] = [];
  const texts = new Map<string, string[]>();
  for (const p of pieces) {
    const key = p.heading ?? NO_HEADING;
    if (!texts.has(key)) { texts.set(key, []); order.push(key); }
    if (!p.isHeading && p.text.trim()) texts.get(key)!.push(p.text.trim());
  }
  let used = 0;
  return order.map((heading) => {
    const full = texts.get(heading)!.join("\n");
    const room = Math.max(0, Math.min(perSection, total - used));
    const text = full.length > room ? full.slice(0, room) : full;
    used += text.length;
    return { heading, text };
  });
}

export interface BriefInput {
  brief: string;
  paths: string[];
  files: Array<{ path: string; excerpt: string }>;
  docs: DocSection[];
  // Names of the attached files sent with the request, in order (so the AI can name a file as a source).
  attachedFiles?: string[];
}

export function inputSize(i: BriefInput): number {
  return JSON.stringify(i).length;
}

/** Brief is never cut. Over the cap: shrink file excerpts, then document text, then the path list. */
export function fitBriefInput(input: BriefInput, cap = BRIEF_INPUT_MAX_CHARS): BriefInput {
  let cur = input;
  const steps: Array<(i: BriefInput) => BriefInput> = [
    (i) => ({ ...i, files: i.files.map((f) => ({ ...f, excerpt: f.excerpt.slice(0, 800) })) }),
    (i) => ({ ...i, files: i.files.map((f) => ({ ...f, excerpt: "" })) }),
    (i) => ({ ...i, docs: i.docs.map((d) => ({ ...d, text: d.text.slice(0, 200) })) }),
    (i) => ({ ...i, paths: i.paths.slice(0, 150) }),
    (i) => ({ ...i, docs: i.docs.map((d) => ({ ...d, text: "" })) }),
  ];
  for (const step of steps) {
    if (inputSize(cur) <= cap) break;
    cur = step(cur);
  }
  return cur;
}

export const MAX_SOURCE_QUOTE_CHARS = 200;
// A shorter quote would match almost anything, so it proves nothing.
export const MIN_SOURCE_QUOTE_CHARS = 8;

export interface BriefVerifyContext {
  // What the brief's requirements may point to: the written instructions text that was sent ("" when there
  // was none) and the names of the attached files that were actually sent.
  source: { instructions: string; files: string[] };
  paths: Set<string>;
  fileText: Map<string, string>;
  docs: DocSection[];
  // For doc quotes: who wrote the piece that contains it.
  pieces: DocPiece[];
  spans: AuthorshipSpan[];
}

function authorsOf(quoteNorm: string, heading: string, ctx: BriefVerifyContext): number[] {
  const piece = ctx.pieces.find((p) => (p.heading ?? NO_HEADING) === heading && normalize(p.text).includes(quoteNorm));
  if (!piece) return [];
  return [...new Set(ctx.spans.filter((s) => s.start < piece.end && s.end > piece.start).map((s) => s.userId))];
}

type RequirementSource = Pick<AiBriefRequirement, "sourceQuote" | "sourceFile" | "sourcePage">;

/**
 * The requirement's source, if it can be confirmed: a sourceQuote that is in the written instructions that
 * were sent (whitespace and case do not matter) and/or a sourceFile that is one of the files actually sent.
 * Null when there is no source, or any source given cannot be confirmed.
 */
function verifySource(r: RawRequirement, src: BriefVerifyContext["source"]): RequirementSource | null {
  const given = (r.sourceQuote ?? "").trim();
  const quote = given.slice(0, MAX_SOURCE_QUOTE_CHARS);
  const file = (r.sourceFile ?? "").trim();
  if (!quote && !file) return null;
  const out: RequirementSource = {};
  if (quote) {
    // Strict about the words, tolerant of formatting (see shared/src/quoteMatch.ts). A quote cut at the
    // character limit may end inside a word.
    const q = normalizeQuote(quote);
    const cut = given.length > MAX_SOURCE_QUOTE_CHARS;
    if (q.length < MIN_SOURCE_QUOTE_CHARS || indexOfQuote(normalizeInstructions(src.instructions), q, cut) === -1) return null;
    out.sourceQuote = quote;
  }
  if (file) {
    const sent = src.files.find((f) => f.toLowerCase() === file.toLowerCase());
    if (!sent) return null;
    out.sourceFile = sent;
    if (Number.isInteger(r.sourcePage) && r.sourcePage! >= 1 && r.sourcePage! <= 9999) out.sourcePage = r.sourcePage;
  }
  return out;
}

export interface VerifiedBrief {
  requirements: AiBriefRequirement[];
  // Requirements the AI returned whose source could not be confirmed (or had none); they are not shown.
  droppedCount: number;
}

/**
 * Keeps only requirements whose source can be confirmed, and only evidence that can be found in what was
 * actually sent. A Found / Partly found answer left with no evidence becomes Not found, flagged
 * `unverified`. Requirements are capped and trimmed.
 */
export function verifyRequirements(raw: RawRequirement[], ctx: BriefVerifyContext): VerifiedBrief {
  let droppedCount = 0;
  const sourced: Array<{ r: RawRequirement; source: RequirementSource }> = [];
  for (const r of raw) {
    if (r.text.trim() === "") continue;
    const source = verifySource(r, ctx.source);
    if (source) sourced.push({ r, source });
    else droppedCount++;
  }
  const requirements = sourced
    .slice(0, MAX_REQUIREMENTS)
    .map(({ r, source }) => {
      const evidence: AiBriefEvidence[] = [];
      if (r.status !== "NOT_FOUND") {
        for (const e of r.evidence.slice(0, 3)) {
          const quote = e.quote.trim().slice(0, MAX_QUOTE_CHARS);
          const q = normalize(quote);
          if (e.type === "file") {
            if (!ctx.paths.has(e.ref)) continue;
            const text = ctx.fileText.get(e.ref);
            if (q && (!text || !normalize(text).includes(q))) continue;
            if (isImportOnly(quote)) continue;
            evidence.push({ type: "file", ref: e.ref, quote });
          } else {
            const section = ctx.docs.find((d) => d.heading === e.ref);
            if (!section || !q) continue;
            // A requirement about the whole document ("write system documentation") is proved by a real
            // heading of the document: the quote is the heading itself, checked against the real outline.
            if (e.ref !== NO_HEADING && q === normalize(e.ref)) {
              evidence.push({ type: "doc", ref: e.ref, quote: "", heading: true });
              continue;
            }
            if (!normalize(section.text).includes(q)) continue;
            evidence.push({ type: "doc", ref: e.ref, quote, authors: authorsOf(q, e.ref, ctx) });
          }
        }
      }
      const found = r.status !== "NOT_FOUND";
      if (found && evidence.length === 0) {
        return { text: r.text.slice(0, 200), status: "NOT_FOUND" as const, evidence: [], unverified: true, ...source };
      }
      return { text: r.text.slice(0, 200), status: r.status, evidence, ...source };
    });
  return { requirements, droppedCount };
}
