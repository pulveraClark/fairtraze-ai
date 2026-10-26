import { createHash } from "node:crypto";
import type { AiBriefEvidence, AiBriefRequirement } from "@shared/aiReviewTypes.js";
import type { AuthorshipSpan } from "../../collab/authorshipMap.js";
import type { DocPiece } from "./docsEvidence.js";
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

export interface BriefVerifyContext {
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

/**
 * Keeps only evidence that can be found in what was actually sent. A Found / Partly found answer left
 * with no evidence becomes Not found, flagged `unverified`. Requirements are capped and trimmed.
 */
export function verifyRequirements(raw: RawRequirement[], ctx: BriefVerifyContext): AiBriefRequirement[] {
  return raw
    .filter((r) => r.text !== "")
    .slice(0, MAX_REQUIREMENTS)
    .map((r) => {
      const evidence: AiBriefEvidence[] = [];
      if (r.status !== "NOT_FOUND") {
        for (const e of r.evidence.slice(0, 3)) {
          const quote = e.quote.trim().slice(0, MAX_QUOTE_CHARS);
          const q = normalize(quote);
          if (e.type === "file") {
            if (!ctx.paths.has(e.ref)) continue;
            const text = ctx.fileText.get(e.ref);
            if (q && (!text || !normalize(text).includes(q))) continue;
            evidence.push({ type: "file", ref: e.ref, quote });
          } else {
            const section = ctx.docs.find((d) => d.heading === e.ref);
            if (!section || !q || !normalize(section.text).includes(q)) continue;
            evidence.push({ type: "doc", ref: e.ref, quote, authors: authorsOf(q, e.ref, ctx) });
          }
        }
      }
      const found = r.status !== "NOT_FOUND";
      if (found && evidence.length === 0) {
        return { text: r.text.slice(0, 200), status: "NOT_FOUND" as const, evidence: [], unverified: true };
      }
      return { text: r.text.slice(0, 200), status: r.status, evidence };
    });
}
