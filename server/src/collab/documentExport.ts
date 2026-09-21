import { createRequire } from "module";
import type * as YTypes from "yjs";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun as DocxTextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
} from "docx";
import { Y } from "./yjsCjs.js";
import { legacySchema } from "./persistence.js";

// Loaded the same CJS way persistence.ts loads it — see that file's comment for why (yjs must
// stay a single module instance across every file that does `instanceof Y.XmlText` etc.).
const require = createRequire(import.meta.url);
const { prosemirrorJSONToYXmlFragment } = require("@tiptap/y-tiptap") as {
  prosemirrorJSONToYXmlFragment: (schema: unknown, json: unknown, fragment: YTypes.XmlFragment) => void;
};

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  color?: string;     // hex, e.g. "#dc2626" — from the textStyle mark
  highlight?: string; // hex, e.g. "#fef08a" — from the highlight mark
}

export type DocBlock =
  | { kind: "heading"; level: number; align?: string; runs: TextRun[] }
  | { kind: "paragraph"; align?: string; runs: TextRun[] }
  | { kind: "listItem"; listType: "bulletList" | "orderedList"; blocks: DocBlock[] }
  | { kind: "table"; rows: { cells: { header: boolean; blocks: DocBlock[] }[] }[] };

export interface ExportComment {
  author: string;
  text: string;
  resolved: boolean;
  createdAt: string;
  parentAuthor?: string; // set for a reply, so it can be indented under its root in the export
}

// ── Read side: Y.XmlFragment -> structured blocks ──────────────────────────────────────────────
//
// Deliberately richer than docxImport.ts's DocxChunk (which only round-trips structural shape for
// import): this also captures inline marks (bold/italic/strike/color/highlight) and alignment, and
// models tables, none of which the import chunker needs to handle.

function runsFromXmlText(xmlText: YTypes.XmlText): TextRun[] {
  const delta = xmlText.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
  const runs: TextRun[] = [];
  for (const op of delta) {
    if (typeof op.insert !== "string" || op.insert.length === 0) continue;
    const attrs = (op.attributes ?? {}) as Record<string, unknown>;
    const textStyle = attrs.textStyle as { color?: string } | undefined;
    const highlight = attrs.highlight as { color?: string } | undefined;
    runs.push({
      text: op.insert,
      bold: !!attrs.bold,
      italic: !!attrs.italic,
      strike: !!attrs.strike,
      underline: !!attrs.underline,
      color: textStyle?.color,
      highlight: highlight?.color,
    });
  }
  return runs;
}

function runsFromElementChildren(el: YTypes.XmlElement): TextRun[] {
  const runs: TextRun[] = [];
  for (const child of el.toArray()) {
    if (child instanceof Y.XmlText) runs.push(...runsFromXmlText(child));
  }
  return runs;
}

function walkBlocks(fragment: YTypes.XmlFragment | YTypes.XmlElement): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const child of fragment.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    const name = child.nodeName;

    if (name === "heading") {
      const level = Number(child.getAttribute("level") ?? 1);
      const align = child.getAttribute("textAlign") as string | undefined;
      blocks.push({ kind: "heading", level, align, runs: runsFromElementChildren(child) });
    } else if (name === "paragraph") {
      const align = child.getAttribute("textAlign") as string | undefined;
      blocks.push({ kind: "paragraph", align, runs: runsFromElementChildren(child) });
    } else if (name === "bulletList" || name === "orderedList") {
      const listType = name as "bulletList" | "orderedList";
      for (const li of child.toArray()) {
        if (!(li instanceof Y.XmlElement) || li.nodeName !== "listItem") continue;
        blocks.push({ kind: "listItem", listType, blocks: walkBlocks(li) });
      }
    } else if (name === "table") {
      const rows: { cells: { header: boolean; blocks: DocBlock[] }[] }[] = [];
      for (const row of child.toArray()) {
        if (!(row instanceof Y.XmlElement) || row.nodeName !== "tableRow") continue;
        const cells: { header: boolean; blocks: DocBlock[] }[] = [];
        for (const cell of row.toArray()) {
          if (!(cell instanceof Y.XmlElement)) continue;
          const header = cell.nodeName === "tableHeader";
          if (!header && cell.nodeName !== "tableCell") continue;
          cells.push({ header, blocks: walkBlocks(cell) });
        }
        rows.push({ cells });
      }
      blocks.push({ kind: "table", rows });
    }
    // Other node types (blockquote, codeBlock, horizontalRule) aren't reachable through this
    // editor's toolbar and fall through unhandled — same "known limitation" pattern docxImport.ts's
    // chunker already documents for tables/images on the import side.
  }
  return blocks;
}

// Builds a scratch, never-registered Y.Doc — NOT via getYDoc() from y-websocket/bin/utils. That
// function's own side effect (for any room not already resident in memory) is invoking
// persistence.ts's bindState(), which registers attachAuthorshipTracking and an update listener.
// A scratch Y.Doc that's never added to y-websocket's `docs` map avoids all of that: this is a
// genuinely clean read with zero interaction with authorshipCapture.ts.
export function readDocumentStructure(doc: { content: string; yjsState: Uint8Array | null }): DocBlock[] {
  const scratch = new Y.Doc();
  try {
    if (doc.yjsState) {
      Y.applyUpdate(scratch, doc.yjsState);
    } else {
      // Mirrors bindState's own legacy-content fallback (persistence.ts) exactly, so a group that
      // has never had a live collaboration session still exports its Step-1 template/typed content.
      try {
        const json = JSON.parse(doc.content) as Record<string, unknown>;
        prosemirrorJSONToYXmlFragment(legacySchema, json, scratch.getXmlFragment("default"));
      } catch (err) {
        console.error("[documentExport] failed to parse legacy content for export", err);
      }
    }
    return walkBlocks(scratch.getXmlFragment("default"));
  } finally {
    scratch.destroy();
  }
}

// ── Write side: structured blocks -> a .docx buffer ─────────────────────────────────────────────

const ORDERED_LIST_REF = "ft-export-ordered-list";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function alignmentFor(align?: string): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (align) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justify":
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
}

function docxRuns(runs: TextRun[]): DocxTextRun[] {
  if (runs.length === 0) return [new DocxTextRun("")];
  return runs.map(
    (r) =>
      new DocxTextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italic,
        strike: r.strike,
        underline: r.underline ? {} : undefined,
        color: r.color?.replace("#", ""),
        // docx's built-in `highlight` option only accepts a fixed named-color enum, not arbitrary
        // hex — approximate this editor's free-form highlight colors via cell/run shading instead.
        shading: r.highlight ? { fill: r.highlight.replace("#", "") } : undefined,
      })
  );
}

function listItemToDocxChildren(item: Extract<DocBlock, { kind: "listItem" }>): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of item.blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") {
      out.push(
        new Paragraph({
          alignment: alignmentFor(b.align),
          children: docxRuns(b.runs),
          bullet: item.listType === "bulletList" ? { level: 0 } : undefined,
          numbering: item.listType === "orderedList" ? { reference: ORDERED_LIST_REF, level: 0 } : undefined,
        })
      );
    } else if (b.kind === "table") {
      out.push(...blockToDocxChildren(b));
    } else if (b.kind === "listItem") {
      out.push(...listItemToDocxChildren(b));
    }
  }
  return out;
}

function blockToDocxChildren(block: DocBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADING_LEVELS[Math.min(Math.max(block.level - 1, 0), HEADING_LEVELS.length - 1)],
          alignment: alignmentFor(block.align),
          children: docxRuns(block.runs),
        }),
      ];
    case "paragraph":
      return [new Paragraph({ alignment: alignmentFor(block.align), children: docxRuns(block.runs) })];
    case "listItem":
      return listItemToDocxChildren(block);
    case "table":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row) =>
              new TableRow({
                children: row.cells.map(
                  (cell) =>
                    new TableCell({
                      shading: cell.header ? { fill: "F1F5F9" } : undefined,
                      children: cell.blocks.length > 0 ? cell.blocks.flatMap(blockToDocxChildren) : [new Paragraph({})],
                    })
                ),
              })
          ),
        }),
      ];
  }
}

export async function buildDocxBuffer(blocks: DocBlock[], comments: ExportComment[]): Promise<Buffer> {
  const bodyChildren = blocks.flatMap(blockToDocxChildren);
  if (bodyChildren.length === 0) bodyChildren.push(new Paragraph({}));

  const commentChildren: Paragraph[] = [];
  if (comments.length > 0) {
    commentChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, text: "Comments" }));
    for (const c of comments) {
      const prefix = c.parentAuthor ? `↳ Reply to ${c.parentAuthor} — ` : "";
      commentChildren.push(
        new Paragraph({
          children: [
            new DocxTextRun({
              text: `${prefix}${c.author} — ${new Date(c.createdAt).toLocaleString()} (${c.resolved ? "resolved" : "open"})`,
              bold: true,
            }),
          ],
        })
      );
      commentChildren.push(new Paragraph({ text: c.text }));
    }
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REF,
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ children: [...bodyChildren, ...commentChildren] }],
  });

  return Packer.toBuffer(document);
}
