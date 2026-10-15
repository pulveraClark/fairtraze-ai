import "../src/index.css";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { PageBreak } from "../src/lib/pageBreak";
import type { JSONContent } from "@tiptap/core";
import { resolvePageGeometry } from "@shared/pageSizes";
import type { PageSizeKey, PageOrientation, MarginPresetKey } from "@shared/pageSizes";
import { SCREEN_PAGE_GAP_PX } from "../src/lib/pageLayout";
import { buildPrintFrame, collectFirstLines, printExtensions } from "../src/lib/printDocument";
import type { PrintLayoutOptions } from "../src/lib/printDocument";
import { layoutPageBreaks } from "../src/lib/pageBreak";
import { headerFooterHtml, EMPTY_HEADER_FOOTER } from "../src/lib/headerFooter";
import type { HeaderFooterText } from "../src/lib/headerFooter";

// Page-parity harness (spike). Builds the SAME document twice - once as the on-screen page view,
// once through the PDF print path (buildPrintFrame) - and reports page count and the first line of
// every sheet for each, so e2e/pageParity.mjs can compare them.

export interface Case {
  size: PageSizeKey;
  orientation: PageOrientation;
  margins: MarginPresetKey;
  /** "plain" has no page breaks; "breaks" has several, including two in a row. */
  doc: "plain" | "breaks";
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
  /** CSS scale of the paper (the real page is scaled to fit narrow stages). Default 1. */
  scale?: number;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const WORDS =
  "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(" ");

function paragraph(i: number): JSONContent {
  const words: string[] = [];
  for (let k = 0; k < 62; k++) words.push(WORDS[(i * 7 + k * 3) % WORDS.length]!);
  return { type: "paragraph", content: [{ type: "text", text: `P${i}: ${words.join(" ")}.` }] };
}

/** 24 paragraphs; "breaks" adds a page break after P4, two after P11 (a blank sheet) and one after P20. */
function buildDoc(kind: Case["doc"]): JSONContent {
  const content: JSONContent[] = [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H1: Layout harness" }] }];
  const breaksAfter = kind === "breaks" ? new Map<number, number>([[4, 1], [11, 2], [20, 1]]) : new Map<number, number>();
  for (let i = 1; i <= 24; i++) {
    content.push(paragraph(i));
    for (let b = 0; b < (breaksAfter.get(i) ?? 0); b++) content.push({ type: "pageBreak" });
  }
  return { type: "doc", content };
}

async function settle(editor: Editor, root: HTMLElement, pageHeight: number, gap: number, scale = 1) {
  const period = pageHeight + gap;
  const dom = editor.view.dom as HTMLElement;
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 80 && stable < 3; i++) {
    editor.view.dispatch(editor.state.tr);
    await nextFrame();
    const moved = layoutPageBreaks(dom, period);
    const top = root.getBoundingClientRect().top;
    const blocks = Array.from(dom.children).filter((c) => !c.classList.contains("rm-pages-wrapper"));
    const bottom = blocks.length ? Math.max(...blocks.slice(-3).map((c) => c.getBoundingClientRect().bottom)) : top;
    const needed = Math.max(1, Math.floor((bottom - top - 1) / (period * scale)) + 1);
    const widgets = dom.querySelectorAll(".rm-page-break").length;
    if (!moved && widgets === needed && widgets === last) stable++;
    else stable = 0;
    last = widgets;
  }
}

function pageNumbers(root: HTMLElement) {
  const read = (sel: string) =>
    Array.from(root.querySelectorAll(sel)).map((el) => getComputedStyle(el, "::before").content.replace(/"/g, ""));
  return { header: read(".rm-page-number-plus"), footer: read(".rm-page-number") };
}

function centerCheck(root: HTMLElement) {
  const paper = root.getBoundingClientRect();
  const mid = paper.left + paper.width / 2;
  const out: { kind: string; offset: number; overlapsNeighbour: boolean }[] = [];
  root.querySelectorAll<HTMLElement>(".ft-hf-center").forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.width === 0) return;
    const band = c.closest(".rm-page-header-content, .rm-page-footer-content");
    const others = band ? Array.from(band.querySelectorAll<HTMLElement>(".ft-hf-left, .ft-hf-right")) : [];
    const overlap = others.some((o) => {
      const q = o.getBoundingClientRect();
      return q.width > 0 && q.left < r.right && q.right > r.left;
    });
    out.push({ kind: band?.className ?? "", offset: Math.round((r.left + r.width / 2 - mid) * 10) / 10, overlapsNeighbour: overlap });
  });
  return out;
}

async function mountScreen(c: Case) {
  const stage = document.getElementById("stage")!;
  stage.innerHTML = "";
  const g = resolvePageGeometry(c.size, c.orientation, c.margins);
  const layout: PrintLayoutOptions = { orientation: c.orientation, margins: c.margins, header: c.header, footer: c.footer };
  const paper = document.createElement("div");
  paper.className = "ft-paper";
  paper.style.width = `${g.widthPx}px`;
  if (c.scale && c.scale !== 1) {
    paper.style.transform = `scale(${c.scale})`;
    paper.style.transformOrigin = "top left";
  }
  stage.appendChild(paper);

  const json = buildDoc(c.doc);
  const editor = new Editor({
    element: paper,
    extensions: printExtensions(c.size, SCREEN_PAGE_GAP_PX, layout),
    content: json,
    editorProps: { attributes: { class: "ft-doc-content text-slate-700" } },
  });
  const [hl, hr] = headerFooterHtml(c.header ?? EMPTY_HEADER_FOOTER, "header");
  const [fl, fr] = headerFooterHtml(c.footer ?? EMPTY_HEADER_FOOTER, "footer");
  editor.commands.updateHeaderContent(hl, hr);
  editor.commands.updateFooterContent(fl, fr);
  await nextFrame();
  await document.fonts.ready;
  await settle(editor, paper, g.heightPx, SCREEN_PAGE_GAP_PX, c.scale ?? 1);
  return { stage, g, layout, paper, editor };
}

/** Leaves the on-screen page view mounted so the runner can screenshot it. */
async function show(c: Case) {
  await mountScreen(c);
}

async function run(c: Case) {
  const { stage, g, layout, paper, editor } = await mountScreen(c);

  const scale = c.scale ?? 1;
  const period = (g.heightPx + SCREEN_PAGE_GAP_PX) * scale; // measured in screen px
  const dom = editor.view.dom as HTMLElement;
  const top = paper.getBoundingClientRect().top;
  const blocks = Array.from(dom.children).filter((c2) => !c2.classList.contains("rm-pages-wrapper"));
  const lastBottom = Math.max(...blocks.slice(-3).map((b) => b.getBoundingClientRect().bottom));
  const screenPages = Math.max(1, Math.floor((lastBottom - top - 1) / period) + 1);
  const screenFirstLines = collectFirstLines(paper, period).slice(0, screenPages);
  const numbers = pageNumbers(paper);
  const centers = centerCheck(paper);
  const paperWidth = Math.round(paper.getBoundingClientRect().width / scale);
  const breakHeights = Array.from(dom.querySelectorAll<HTMLElement>(".ft-page-break")).map((e) => e.style.height);

  const json2 = editor.getJSON();
  editor.destroy();
  stage.innerHTML = "";

  const frame = await buildPrintFrame(json2, c.size, layout);
  const doc = frame.iframe.contentDocument!;
  const printHtml = "<!doctype html>" + doc.documentElement.outerHTML;
  const result = {
    case: c,
    geometry: { w: g.widthPx, h: g.heightPx },
    screen: { pages: screenPages, firstLines: screenFirstLines, paperWidth, breakHeights, numbers, centers },
    print: { pages: frame.pageCount, firstLines: frame.firstLines },
    printHtml,
  };
  frame.destroy();
  return result;
}

/**
 * Old-client risk: a tab opened BEFORE a deploy has a schema without `pageBreak`. When a new client
 * inserts one, does the old client's y-prosemirror delete the unknown element from the SHARED
 * document (and sync that deletion to everyone)? Two real editors on two Y.Docs, wired together the
 * way y-websocket wires clients through the server (every update forwarded, origin-tagged).
 */
async function schemaMismatch() {
  const newDoc = new Y.Doc();
  const oldDoc = new Y.Doc();
  const log = { oldSent: 0, newSent: 0 };
  const REMOTE = Symbol("remote");
  newDoc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    log.newSent++;
    Y.applyUpdate(oldDoc, u, REMOTE);
  });
  oldDoc.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    log.oldSent++;
    Y.applyUpdate(newDoc, u, REMOTE);
  });
  const mk = (doc: Y.Doc, withBreak: boolean) => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return new Editor({
      element: el,
      extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: doc }), ...(withBreak ? [PageBreak] : [])],
    });
  };
  const newEd = mk(newDoc, true);
  const oldEd = mk(oldDoc, false);
  await nextFrame();
  newEd.commands.insertContent("<p>before</p>");
  newEd.commands.setPageBreak();
  newEd.commands.insertContent("<p>after</p>");
  for (let i = 0; i < 10; i++) await nextFrame();
  const count = (d: Y.Doc) => {
    let n = 0;
    const walk = (x: Y.XmlFragment | Y.XmlElement) =>
      x.toArray().forEach((c) => {
        if (c instanceof Y.XmlElement) {
          if (c.nodeName === "pageBreak") n++;
          walk(c);
        }
      });
    walk(d.getXmlFragment("default"));
    return n;
  };
  const result = {
    pageBreaksInNewDoc: count(newDoc),
    pageBreaksInOldDoc: count(oldDoc),
    updatesSentByOldClient: log.oldSent,
    oldEditorShowsPageBreak: JSON.stringify(oldEd.getJSON()).includes("pageBreak"),
    oldEditorText: oldEd.state.doc.textContent,
    newEditorText: newEd.state.doc.textContent,
  };
  newEd.destroy();
  oldEd.destroy();
  return result;
}

(window as unknown as { __harness: { run: typeof run; show: typeof show; schemaMismatch: typeof schemaMismatch } }).__harness = {
  run,
  show,
  schemaMismatch,
};
