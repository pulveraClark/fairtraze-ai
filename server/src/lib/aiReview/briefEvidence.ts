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

const IMPORT_WORDS = new Set(["import", "from", "as", "const", "let", "var", "require", "include", "using", "use", "static", "type"]);
const MIN_IMPORT_NAME_CHARS = 3;

/** The library / module / tool names an import-only quote brings in ("import tkinter as tk" gives "tkinter"). */
export function importedNames(quote: string): string[] {
  const names = new Set<string>();
  for (const line of quote.split(/\r?\n/)) {
    // The alias after "as" is the author's own name, not the library's.
    const words = line.replace(/\bas\s+[\w$]+/gi, " ").match(/[A-Za-z_$][\w$]*/g) ?? [];
    for (const w of words) {
      if (!IMPORT_WORDS.has(w.toLowerCase()) && w.length >= MIN_IMPORT_NAME_CHARS) names.add(w.toLowerCase());
    }
  }
  return [...names];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when the requirement names a library or tool that the import-only quote brings in (case does not
 * matter; whole words only). "Use a Tkinter GUI" is proved by `import tkinter`; "Build a route planner" is not.
 */
export function requirementNamesImport(quote: string, requirementText: string): boolean {
  const hay = requirementText.toLowerCase();
  return importedNames(quote).some((n) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`, "u").test(hay));
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

function authorsOf(piece: DocPiece, ctx: BriefVerifyContext): number[] {
  return [...new Set(ctx.spans.filter((s) => s.start < piece.end && s.end > piece.start).map((s) => s.userId))];
}

/** The first real piece of the document (title, heading, paragraph, list item, table cell) that holds the quote. */
function findDocPiece(q: string, ref: string, ctx: BriefVerifyContext): DocPiece | null {
  const has = (p: DocPiece) => indexOfQuote(normalizeInstructions(p.text), q) !== -1;
  // The cited section first, so a quote that appears twice stays where the AI pointed.
  return ctx.pieces.find((p) => (p.heading ?? NO_HEADING) === ref && has(p)) ?? ctx.pieces.find(has) ?? null;
}

export interface ProofCheckCount {
  // Requirements the AI marked Found / Partly found, and how many of them ended up unverified.
  claimed: number;
  demoted: number;
  quoteNotFound: number;
  refNotFound: number;
}

/** One log line per run (log only, nothing stored). */
export function logProofCheck(label: string, p: ProofCheckCount): ProofCheckCount {
  console.info(
    `[ai-review] proof check ${label}: ${p.claimed} marked found or partly found, ${p.demoted} demoted to unverified (quote not found ${p.quoteNotFound}, ref not found ${p.refNotFound})`,
  );
  return p;
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
  proof: ProofCheckCount;
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
  const proof: ProofCheckCount = { claimed: 0, demoted: 0, quoteNotFound: 0, refNotFound: 0 };
  const requirements = sourced
    .slice(0, MAX_REQUIREMENTS)
    .map(({ r, source }) => {
      const evidence: AiBriefEvidence[] = [];
      let firstRejection: "quote" | "ref" | null = null;
      const reject = (why: "quote" | "ref") => { firstRejection ??= why; };
      if (r.status !== "NOT_FOUND") {
        for (const e of r.evidence.slice(0, 3)) {
          const quote = e.quote.trim().slice(0, MAX_QUOTE_CHARS);
          const q = normalize(quote);
          if (e.type === "file") {
            if (!ctx.paths.has(e.ref)) { reject("ref"); continue; }
            const text = ctx.fileText.get(e.ref);
            if (q && (!text || !normalize(text).includes(q))) { reject("quote"); continue; }
            // An import proves a library is used. That is proof only for a requirement that names the library.
            if (isImportOnly(quote) && !requirementNamesImport(quote, `${r.text} ${r.sourceQuote ?? ""}`)) { reject("quote"); continue; }
            evidence.push({ type: "file", ref: e.ref, quote });
          } else {
            const nq = normalizeQuote(quote);
            if (!nq) { reject("quote"); continue; }
            // A requirement about the whole document ("write system documentation") is proved by a real
            // heading (or the title) of the document: the quote is that whole heading, checked against the
            // real outline. This is the only way a quote shorter than the minimum is accepted.
            const heading = ctx.pieces.find((p) => p.isHeading && p.text.trim() !== "" && normalizeQuote(p.text) === nq);
            if (heading) {
              evidence.push({ type: "doc", ref: heading.text.trim(), quote: "", heading: true });
              continue;
            }
            if (nq.length < MIN_SOURCE_QUOTE_CHARS) { reject("quote"); continue; }
            // Anywhere in the real document text counts (title, headings, body, list items, table cells),
            // not only the body of the cited section. A wrong ref is re-anchored to the nearest heading above.
            const piece = findDocPiece(nq, e.ref, ctx);
            if (piece) {
              evidence.push({ type: "doc", ref: piece.heading ?? NO_HEADING, quote, authors: authorsOf(piece, ctx) });
              continue;
            }
            // No pieces to search (older callers): the cited section's text is all there is.
            const section = ctx.pieces.length === 0 ? ctx.docs.find((d) => d.heading === e.ref) : undefined;
            if (section && indexOfQuote(normalizeInstructions(section.text), nq) !== -1) {
              evidence.push({ type: "doc", ref: e.ref, quote, authors: [] });
              continue;
            }
            reject("quote");
          }
        }
      }
      const found = r.status !== "NOT_FOUND";
      if (found) proof.claimed++;
      if (found && evidence.length === 0) {
        proof.demoted++;
        if (firstRejection === "ref") proof.refNotFound++;
        else proof.quoteNotFound++;
        return { text: r.text.slice(0, 200), status: "NOT_FOUND" as const, evidence: [], unverified: true, ...source };
      }
      return { text: r.text.slice(0, 200), status: r.status, evidence, ...source };
    });
  return { requirements, droppedCount, proof };
}
