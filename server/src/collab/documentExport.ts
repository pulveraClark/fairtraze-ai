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
  BorderStyle,
  ExternalHyperlink,
  Footer,
  Header,
  PageNumber,
  PageOrientation as DocxPageOrientation,
  Tab,
  TabStopType,
} from "docx";
import type { IParagraphOptions } from "docx";
import { Y } from "./yjsCjs.js";
import { legacySchema } from "./persistence.js";
import { isSafeLinkUrl } from "@shared/linkUrl.js";
import { PAGE_SIZES, PAGE_TOKEN, resolvePageGeometry } from "@shared/pageSizes.js";
import type { MarginPresetKey, MarginsIn, PageOrientation, PageSizeKey } from "@shared/pageSizes.js";

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
  link?: string;      // http(s)/mailto href only — anything else is dropped (shared/src/linkUrl.ts)
}

export type DocBlock =
  | { kind: "heading"; level: number; align?: string; indent?: number; runs: TextRun[] }
  | { kind: "paragraph"; align?: string; indent?: number; runs: TextRun[] }
  | { kind: "listItem"; listType: "bulletList" | "orderedList"; blocks: DocBlock[] }
  | { kind: "taskItem"; checked: boolean; blocks: DocBlock[] }
  | { kind: "rule" }
  | { kind: "pageBreak" }
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
    const href = (attrs.link as { href?: unknown } | undefined)?.href;
    runs.push({
      text: op.insert,
      bold: !!attrs.bold,
      italic: !!attrs.italic,
      strike: !!attrs.strike,
      underline: !!attrs.underline,
      color: textStyle?.color,
      highlight: highlight?.color,
      // A hostile href written into the shared document by a modified client is dropped here.
      link: typeof href === "string" && isSafeLinkUrl(href) ? href : undefined,
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

function indentOf(el: YTypes.XmlElement): number | undefined {
  const n = Number(el.getAttribute("indent") ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 8) : undefined;
}

function walkBlocks(fragment: YTypes.XmlFragment | YTypes.XmlElement): DocBlock[] {
  const blocks: DocBlock[] = [];
  for (const child of fragment.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    const name = child.nodeName;

    if (name === "heading") {
      const level = Number(child.getAttribute("level") ?? 1);
      const align = child.getAttribute("textAlign") as string | undefined;
      blocks.push({ kind: "heading", level, align, indent: indentOf(child), runs: runsFromElementChildren(child) });
    } else if (name === "paragraph") {
      const align = child.getAttribute("textAlign") as string | undefined;
      blocks.push({ kind: "paragraph", align, indent: indentOf(child), runs: runsFromElementChildren(child) });
    } else if (name === "bulletList" || name === "orderedList") {
      const listType = name as "bulletList" | "orderedList";
      for (const li of child.toArray()) {
        if (!(li instanceof Y.XmlElement) || li.nodeName !== "listItem") continue;
        blocks.push({ kind: "listItem", listType, blocks: walkBlocks(li) });
      }
    } else if (name === "taskList") {
      for (const li of child.toArray()) {
        if (!(li instanceof Y.XmlElement) || li.nodeName !== "taskItem") continue;
        const raw = li.getAttribute("checked") as unknown;
        blocks.push({ kind: "taskItem", checked: raw === true || raw === "true", blocks: walkBlocks(li) });
      }
    } else if (name === "horizontalRule") {
      blocks.push({ kind: "rule" });
    } else if (name === "pageBreak") {
      blocks.push({ kind: "pageBreak" });
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
    // Other node types (blockquote, codeBlock) aren't reachable through this
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

const TWIPS_PER_INDENT_LEVEL = 720; // 0.5in, matching the editor's 48px step
const CHECKED_BOX = String.fromCharCode(0x2611);
const UNCHECKED_BOX = String.fromCharCode(0x2610);

function docxRuns(runs: TextRun[], prefix = ""): (DocxTextRun | ExternalHyperlink)[] {
  const out: (DocxTextRun | ExternalHyperlink)[] = [];
  if (prefix) out.push(new DocxTextRun(prefix));
  if (runs.length === 0) return out.length > 0 ? out : [new DocxTextRun("")];
  for (const r of runs) {
    const link = r.link;
    const run = new DocxTextRun({
      text: r.text,
      bold: r.bold,
      italics: r.italic,
      strike: r.strike,
      underline: r.underline || link ? {} : undefined,
      color: link ? "1D4ED8" : r.color?.replace("#", ""),
      // docx's built-in `highlight` option only accepts a fixed named-color enum, not arbitrary
      // hex — approximate this editor's free-form highlight colors via cell/run shading instead.
      shading: r.highlight ? { fill: r.highlight.replace("#", "") } : undefined,
    });
    out.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
  }
  return out;
}

function indentProps(indent?: number) {
  return indent ? { indent: { left: indent * TWIPS_PER_INDENT_LEVEL } } : {};
}

const MAX_LIST_LEVEL = 5;

// A page break is exported as `pageBreakBefore` on the paragraph that follows it (a lone break
// character would leave an empty line at the top of the next page in Word, which the app does not
// have). `pending` is set by a pageBreak block and consumed by the next paragraph built. The body is
// built synchronously, so this module-level flag cannot interleave between exports.
const pb = { pending: false };
function P(options: IParagraphOptions): Paragraph {
  const next = pb.pending ? { ...options, pageBreakBefore: true } : options;
  pb.pending = false;
  return new Paragraph(next);
}

function listItemToDocxChildren(item: Extract<DocBlock, { kind: "listItem" }>, level = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const lvl = Math.min(level, MAX_LIST_LEVEL);
  for (const b of item.blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") {
      out.push(
        P({
          alignment: alignmentFor(b.align),
          children: docxRuns(b.runs),
          bullet: item.listType === "bulletList" ? { level: lvl } : undefined,
          numbering: item.listType === "orderedList" ? { reference: ORDERED_LIST_REF, level: lvl } : undefined,
        })
      );
    } else if (b.kind === "table") {
      out.push(...blockToDocxChildren(b));
    } else if (b.kind === "listItem") {
      // A nested list: its items sit one level deeper than the item that contains them.
      out.push(...listItemToDocxChildren(b, level + 1));
    } else if (b.kind === "taskItem") {
      out.push(...taskItemToDocxChildren(b, level + 1));
    }
  }
  return out;
}

// A checklist item is exported as a paragraph led by a ballot-box character. That character
// exists only in the exported file; it is not document text and never reaches authorship capture.
function taskItemToDocxChildren(item: Extract<DocBlock, { kind: "taskItem" }>, level = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let first = true;
  for (const b of item.blocks) {
    if (b.kind === "paragraph" || b.kind === "heading") {
      out.push(
        P({
          alignment: alignmentFor(b.align),
          indent: { left: (level + 1) * TWIPS_PER_INDENT_LEVEL / 2 },
          children: docxRuns(b.runs, first ? `${item.checked ? CHECKED_BOX : UNCHECKED_BOX} ` : ""),
        })
      );
      first = false;
    } else if (b.kind === "taskItem") {
      out.push(...taskItemToDocxChildren(b, level + 1));
    } else if (b.kind === "listItem") {
      out.push(...listItemToDocxChildren(b, level + 1));
    } else if (b.kind === "table") {
      out.push(...blockToDocxChildren(b));
    }
  }
  return out;
}

function blockToDocxChildren(block: DocBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading":
      return [
        P({
          heading: HEADING_LEVELS[Math.min(Math.max(block.level - 1, 0), HEADING_LEVELS.length - 1)],
          alignment: alignmentFor(block.align),
          ...indentProps(block.indent),
          children: docxRuns(block.runs),
        }),
      ];
    case "paragraph":
      return [
        P({ alignment: alignmentFor(block.align), ...indentProps(block.indent), children: docxRuns(block.runs) }),
      ];
    case "pageBreak":
      return []; // handled by blocksToDocxChildren, which needs to see the next block
    case "listItem":
      return listItemToDocxChildren(block);
    case "taskItem":
      return taskItemToDocxChildren(block);
    case "rule":
      return [
        P({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, space: 1, color: "94A3B8" } },
          children: [],
        }),
      ];
    case "table": {
      // A table cannot carry pageBreakBefore, so a pending break gets its own empty paragraph.
      const lead = pb.pending ? [P({ children: [] })] : [];
      return [
        ...lead,
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row) =>
              new TableRow({
                children: row.cells.map(
                  (cell) =>
                    new TableCell({
                      shading: cell.header ? { fill: "F1F5F9" } : undefined,
                      children: cell.blocks.length > 0 ? cell.blocks.flatMap(blockToDocxChildren) : [P({})],
                    })
                ),
              })
          ),
        }),
      ];
    }
  }
}

function blocksToDocxChildren(blocks: DocBlock[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    if (b.kind === "pageBreak") {
      // Two breaks in a row leave a blank page between them, as in Word.
      if (pb.pending) out.push(P({ children: [] }));
      pb.pending = true;
      continue;
    }
    out.push(...blockToDocxChildren(b));
  }
  if (pb.pending) out.push(P({ children: [] })); // a break at the very end still opens a new page
  return out;
}

export interface DocLayout {
  pageSize: PageSizeKey;
  orientation: PageOrientation;
  marginPreset: MarginPresetKey;
  /** The four effective margins in inches (equal to the preset for named presets). */
  margins: MarginsIn;
  header: { left: string; center: string; right: string };
  footer: { left: string; center: string; right: string };
}

const TWIPS_PER_PX = 15; // 1440 twips per inch / 96 px per inch

/** Text with {page} tokens as runs: plain text pieces and Word PAGE fields. */
function slotRuns(text: string): DocxTextRun[] {
  const run = (children: (string | typeof PageNumber.CURRENT)[]) =>
    new DocxTextRun({ children, size: 20, color: "475569" });
  const parts = text.split(PAGE_TOKEN);
  const out: DocxTextRun[] = [];
  parts.forEach((part, i) => {
    if (part) out.push(run([part]));
    if (i < parts.length - 1) out.push(run([PageNumber.CURRENT]));
  });
  return out;
}

/** One line: left text, centre text at the middle tab, right text at the right tab. */
function bandParagraph(t: { left: string; center: string; right: string }, textWidthTwips: number): Paragraph | null {
  if (!t.left && !t.center && !t.right) return null;
  const children: DocxTextRun[] = [...slotRuns(t.left)];
  const tab = () => new DocxTextRun({ children: [new Tab()] });
  if (t.center || t.right) children.push(tab(), ...slotRuns(t.center));
  if (t.right) children.push(tab(), ...slotRuns(t.right));
  return new Paragraph({
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(textWidthTwips / 2) },
      { type: TabStopType.RIGHT, position: textWidthTwips },
    ],
    children,
  });
}

export async function buildDocxBuffer(blocks: DocBlock[], comments: ExportComment[], layout?: DocLayout): Promise<Buffer> {
  pb.pending = false;
  const bodyChildren = blocksToDocxChildren(blocks);
  pb.pending = false;
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

  // Page setup. docx takes the PORTRAIT width/height and swaps them itself for landscape.
  let properties: NonNullable<ConstructorParameters<typeof Document>[0]["sections"]>[number]["properties"] | undefined;
  let headers: { default: Header } | undefined;
  let footers: { default: Footer } | undefined;
  if (layout) {
    const g = resolvePageGeometry(layout.pageSize, layout.orientation, layout.marginPreset, layout.margins);
    const paper = PAGE_SIZES[layout.pageSize];
    properties = {
      page: {
        size: {
          width: paper.widthTwip,
          height: paper.heightTwip,
          orientation: g.landscape ? DocxPageOrientation.LANDSCAPE : DocxPageOrientation.PORTRAIT,
        },
        margin: {
          top: Math.round(g.marginTopPx * TWIPS_PER_PX),
          bottom: Math.round(g.marginBottomPx * TWIPS_PER_PX),
          left: Math.round(g.marginLeftPx * TWIPS_PER_PX),
          right: Math.round(g.marginRightPx * TWIPS_PER_PX),
        },
      },
    };
    const textWidth = g.widthTwip - Math.round((g.marginLeftPx + g.marginRightPx) * TWIPS_PER_PX);
    const headerP = bandParagraph(layout.header, textWidth);
    const footerP = bandParagraph(layout.footer, textWidth);
    if (headerP) headers = { default: new Header({ children: [headerP] }) };
    if (footerP) footers = { default: new Footer({ children: [footerP] }) };
  }

  const document = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REF,
          levels: Array.from({ length: MAX_LIST_LEVEL + 1 }, (_, level) => ({
            level,
            format: "decimal" as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ properties, headers, footers, children: [...bodyChildren, ...commentChildren] }],
  });

  return Packer.toBuffer(document);
}
