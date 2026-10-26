import { prisma } from "../prisma.js";
import { readDocumentStructure, type DocBlock } from "../../collab/documentExport.js";
import { computeAuthorshipMap, type AuthorshipSpan } from "../../collab/authorshipMap.js";

// Docs evidence for the AI review. Reads the SAVED document state into a throwaway Y.Doc
// (readDocumentStructure) and the existing authorship map; never touches the live room, never creates
// an EditEvent/EditSession. Offsets follow the capture pipeline: concatenated text of every text run
// in document order, with no separators between blocks.

export const MEMBER_DOC_CHARS = 3000;

export interface DocPiece {
  start: number;
  end: number;
  text: string;
  heading: string | null; // nearest heading at or before this piece
  isHeading: boolean;
}

export function flattenDocument(blocks: DocBlock[]): DocPiece[] {
  const pieces: DocPiece[] = [];
  let offset = 0;
  let current: string | null = null;

  const walk = (list: DocBlock[]): void => {
    for (const b of list) {
      if (b.kind === "heading" || b.kind === "paragraph") {
        const text = b.runs.map((r) => r.text).join("");
        const isHeading = b.kind === "heading";
        if (isHeading && text.trim()) current = text.trim();
        pieces.push({ start: offset, end: offset + text.length, text, heading: current, isHeading });
        offset += text.length;
      } else if (b.kind === "listItem" || b.kind === "taskItem") {
        walk(b.blocks);
      } else if (b.kind === "table") {
        for (const row of b.rows) for (const cell of row.cells) walk(cell.blocks);
      }
    }
  };
  walk(blocks);
  return pieces;
}

export interface MemberDocEvidence {
  // Section headings the member wrote under, in document order.
  headings: string[];
  // The member's own retained text, grouped under those headings, capped.
  excerpt: string;
  chars: number;
}

export function memberDocEvidence(
  pieces: DocPiece[],
  spans: AuthorshipSpan[],
  userId: number,
  cap: number = MEMBER_DOC_CHARS,
): MemberDocEvidence {
  const mine = spans.filter((s) => s.userId === userId);
  const bySection = new Map<string, string[]>();
  let chars = 0;
  for (const piece of pieces) {
    let text = "";
    for (const span of mine) {
      const from = Math.max(span.start, piece.start);
      const to = Math.min(span.end, piece.end);
      if (to > from) text += piece.text.slice(from - piece.start, to - piece.start);
    }
    text = text.trim();
    if (!text) continue;
    chars += text.length;
    const key = piece.heading ?? "";
    const list = bySection.get(key) ?? [];
    list.push(text);
    bySection.set(key, list);
  }

  const headings = [...bySection.keys()].filter((h) => h !== "");
  const parts: string[] = [];
  for (const [heading, texts] of bySection) {
    parts.push(`${heading ? `## ${heading}` : "## (before the first heading)"}\n${texts.join("\n")}`);
  }
  let excerpt = parts.join("\n\n");
  if (excerpt.length > cap) excerpt = `${excerpt.slice(0, cap)}…`;
  return { headings, excerpt, chars };
}

export interface GroupDocEvidence {
  hasDocument: boolean;
  pieces: DocPiece[];
  spans: AuthorshipSpan[];
}

export async function loadGroupDocEvidence(projectId: number): Promise<GroupDocEvidence> {
  const doc = await prisma.document.findUnique({ where: { groupId: projectId } });
  if (!doc) return { hasDocument: false, pieces: [], spans: [] };
  const pieces = flattenDocument(readDocumentStructure(doc));
  const { spans } = await computeAuthorshipMap(doc.id);
  return { hasDocument: true, pieces, spans };
}
