import "../src/index.css";
import { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import StarterKit from "@tiptap/starter-kit";
import * as Y from "yjs";
import type { JSONContent } from "@tiptap/core";
import { resolvePageGeometry } from "@shared/pageSizes";
import type { MarginPresetKey, MarginsIn, PageOrientation, PageSizeKey } from "@shared/pageSizes";
import { SCREEN_PAGE_GAP_PX } from "../src/lib/pageLayout";
import { collectFirstLines, printExtensions } from "../src/lib/printDocument";
import type { PrintLayoutOptions } from "../src/lib/printDocument";
import { layoutPageBreaks } from "../src/lib/pageBreak";
import { headerFooterHtml, EMPTY_HEADER_FOOTER } from "../src/lib/headerFooter";
import type { HeaderFooterText } from "../src/lib/headerFooter";
import { collectLayout } from "../src/lib/pdf/collectLayout";
import { resolveDocFamily } from "../src/lib/pdf/fontRegistry";
import { buildPdf } from "../src/lib/pdf/pdfExport";
import type { Op } from "../src/lib/pdf/ops";

// Real-browser harness for the PDF export (driven by e2e/pdfExport.mjs). It mounts the document as
// the ON-SCREEN page view, reads the screen's own layout with the same collector the exporter uses,
// builds the real PDF through buildPdf() and hands both to the runner for comparison.

export type DocKind = "plain" | "flow" | "every" | "url" | "markers" | "long" | "missing";

export interface PdfCase {
  doc: DocKind;
  size: PageSizeKey;
  orientation: PageOrientation;
  margins: MarginPresetKey;
  custom?: MarginsIn;
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
  /** Run with the app in a dark theme (class, data-theme, color-scheme and a dark media rule). */
  dark?: boolean;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const cell = (type: "tableHeader" | "tableCell", s: string): JSONContent => ({ type, content: [p(t(s))] });

function canvasDataUrl(type: "image/png" | "image/jpeg" | "image/webp", w: number, h: number, label: string): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#2563eb");
  grad.addColorStop(1, "#16a34a");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.font = "bold 24px sans-serif";
  g.fillText(label, 16, h / 2 + 8);
  return c.toDataURL(type, 0.92);
}

const WORDS = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango".split(" ");
const sentence = (i: number, n: number) => Array.from({ length: n }, (_, k) => WORDS[(i * 7 + k * 3) % WORDS.length]).join(" ");
/** A paragraph whose first word is a unique token (Q12:) so duplicated text between pages is detectable. */
const para = (i: number, words = 62): JSONContent => p(t(`Q${i}: ${sentence(i, words)}.`));

export function buildDoc(kind: DocKind): JSONContent {
  const heading = (s: string): JSONContent => ({ type: "heading", attrs: { level: 1 }, content: [t(s)] });
  if (kind === "flow") {
    // 24 paragraphs, no page breaks.
    const content: JSONContent[] = [heading("H1: Flowing document")];
    for (let i = 1; i <= 24; i++) content.push(para(i));
    return { type: "doc", content };
  }
  if (kind === "plain") {
    // 24 paragraphs with page breaks (two in a row leave a blank sheet), like the parity harness.
    const content: JSONContent[] = [heading("H1: Plain document")];
    const breaks = new Map<number, number>([[4, 1], [11, 2], [20, 1]]);
    for (let i = 1; i <= 24; i++) {
      content.push(para(i));
      for (let b = 0; b < (breaks.get(i) ?? 0); b++) content.push({ type: "pageBreak" });
    }
    return { type: "doc", content };
  }
  if (kind === "url") {
    const url = "https://example.com/a/very/long/path/with-no-spaces-at-all/" + "segment-".repeat(18) + "end?query=" + "x".repeat(60);
    return {
      type: "doc",
      content: [
        heading("U1: Long URL"),
        p(t("U2: A long link that must wrap onto several lines: "), t(url, [{ type: "link", attrs: { href: url } }]), t(" and the sentence goes on after it.")),
        p(t("U3: A very long unbroken word " + "Supercalifragilistic".repeat(8) + " ends here.")),
        p(t("U4: last paragraph.")),
      ],
    };
  }
  if (kind === "missing") {
    return { type: "doc", content: [p(t("M1: Peso ₱ ñ Ñ done")), p(t("M2: emoji \u{1F600} and 漢字 are not in the fonts")), p(t("M3: end."))] };
  }
  if (kind === "markers") {
    // Lists at 12, 14, 16, 20 and 24 px (the sizes come from CSS in run(), by list position).
    const content: JSONContent[] = [];
    for (let i = 0; i < 5; i++) {
      content.push({ type: "bulletList", content: [li(p(t(`B${i}a: bullet item`))), li(p(t(`B${i}b: second`)), { type: "bulletList", content: [li(p(t(`B${i}c: nested`)))] })] });
      content.push({ type: "orderedList", content: [li(p(t(`N${i}a: number`))), li(p(t(`N${i}b: number`))), li(p(t(`N${i}c: number`)))] });
    }
    return { type: "doc", content };
  }
  if (kind === "long") {
    const content: JSONContent[] = [heading("L1: Fifty page document")];
    for (let i = 1; i <= 290; i++) {
      content.push(para(i));
      if (i % 40 === 0) {
        content.push({ type: "bulletList", content: [li(p(t(`Q${i}b: list one`))), li(p(t(`Q${i}c: list two`)))] });
        content.push({ type: "table", content: [
          { type: "tableRow", content: [cell("tableHeader", `Q${i}d: Name`), cell("tableHeader", "Role")] },
          { type: "tableRow", content: [cell("tableCell", "Member A"), cell("tableCell", "Writer")] },
        ] });
      }
    }
    return { type: "doc", content };
  }
  // "every": one of everything the editor can produce.
  const url = "https://example.com/docs/page?id=42";
  const png = canvasDataUrl("image/png", 300, 120, "PNG image");
  const jpeg = canvasDataUrl("image/jpeg", 240, 100, "JPEG image");
  const webp = canvasDataUrl("image/webp", 200, 80, "WebP image");
  return {
    type: "doc",
    content: [
      heading("E1: Every feature"),
      { type: "heading", attrs: { level: 2 }, content: [t("E2: Second level heading")] },
      { type: "heading", attrs: { level: 3 }, content: [t("E3: Third level heading")] },
      { type: "paragraph", attrs: { textAlign: "justify" }, content: [t(`E4: ${sentence(3, 40)}. `), t("Bold", [{ type: "bold" }]), t(" "), t("italic", [{ type: "italic" }]), t(" "), t("both", [{ type: "bold" }, { type: "italic" }]), t(" "), t("underline", [{ type: "underline" }]), t(" "), t("strike", [{ type: "strike" }]), t(" H"), t("2", [{ type: "subscript" }]), t("O E=mc"), t("2", [{ type: "superscript" }]), t(" "), t("code", [{ type: "code" }]), t(" "), t("red text", [{ type: "textStyle", attrs: { color: "#dc2626" } }]), t(" "), t("highlighted", [{ type: "highlight", attrs: { color: "#fef08a" } }]), t(" "), t("large", [{ type: "textStyle", attrs: { fontSize: "24px" } }]), t(" "), t("small", [{ type: "textStyle", attrs: { fontSize: "12px" } }]), t(" and the sentence ends here.")] },
      p(t("E5: Sans ", [{ type: "textStyle", attrs: { fontFamily: "Arial, Helvetica, sans-serif" } }]), t("Serif ", [{ type: "textStyle", attrs: { fontFamily: "Georgia, 'Times New Roman', serif" } }]), t("Mono ", [{ type: "textStyle", attrs: { fontFamily: "'Courier New', Courier, monospace" } }]), t("Comic ", [{ type: "textStyle", attrs: { fontFamily: "'Comic Sans MS', 'Comic Sans', cursive" } }]), t("Bold serif", [{ type: "textStyle", attrs: { fontFamily: "Georgia, 'Times New Roman', serif" } }, { type: "bold" }]), t(" italic mono", [{ type: "textStyle", attrs: { fontFamily: "'Courier New', Courier, monospace" } }, { type: "italic" }])),
      p(t("E6: Filipino: Ñandú, año, niño, café, résumé, ÁÉÍÓÚ áéíóú, ñ Ñ, ü, ₱500.00 peso.")),
      { type: "paragraph", attrs: { indent: 2 }, content: [t("E7: An indented paragraph that is long enough to wrap onto a second line so the indent shows. " + sentence(5, 18) + ".")] },
      p(t("E8: link "), t("https example", [{ type: "link", attrs: { href: url } }]), t(" and "), t("mail me", [{ type: "link", attrs: { href: "mailto:team@example.com" } }]), t(" end.")),
      { type: "bulletList", content: [li(p(t("E9: bullet one"))), li(p(t("E10: bullet two")), { type: "bulletList", content: [li(p(t("E11: nested bullet")), { type: "bulletList", content: [li(p(t("E12: deep nested")))] })] })] },
      { type: "orderedList", content: [li(p(t("E13: numbered one"))), li(p(t("E14: numbered two")), { type: "orderedList", content: [li(p(t("E15: nested number")))] }), li(p(t("E16: numbered three")))] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("E17: done task"))] }, { type: "taskItem", attrs: { checked: false }, content: [p(t("E18: open task"))] }] },
      { type: "horizontalRule" },
      { type: "table", content: [
        { type: "tableRow", content: [cell("tableHeader", "E19: Name"), cell("tableHeader", "Role"), cell("tableHeader", "Done")] },
        { type: "tableRow", content: [cell("tableCell", "Member A"), cell("tableCell", "Writer"), cell("tableCell", "Yes")] },
        { type: "tableRow", content: [cell("tableCell", "Member B"), cell("tableCell", "Editor"), cell("tableCell", "No")] },
      ] },
      p(t("E20: images follow.")),
      { type: "paragraph", content: [{ type: "image", attrs: { src: png, width: 240, height: 96 } }, t(" "), { type: "image", attrs: { src: jpeg, width: 160, height: 67 } }, t(" "), { type: "image", attrs: { src: webp, width: 120, height: 48 } }] },
      { type: "pageBreak" },
      p(t("E21: after the page break.")),
      p(t("E22: a very long URL wraps: "), t("https://example.com/" + "long-segment-".repeat(14), [{ type: "link", attrs: { href: "https://example.com/long" } }])),
    ],
  };
}

async function settle(editor: Editor, root: HTMLElement, pageHeight: number, gap: number) {
  const period = pageHeight + gap;
  const dom = editor.view.dom as HTMLElement;
  let stable = 0;
  let last = -1;
  for (let i = 0; i < 120 && stable < 3; i++) {
    editor.view.dispatch(editor.state.tr);
    await nextFrame();
    const moved = layoutPageBreaks(dom, period);
    const top = root.getBoundingClientRect().top;
    const blocks = Array.from(dom.children).filter((c) => !c.classList.contains("rm-pages-wrapper"));
    const bottom = blocks.length ? Math.max(...blocks.slice(-3).map((c) => c.getBoundingClientRect().bottom)) : top;
    const needed = Math.max(1, Math.floor((bottom - top - 1) / period) + 1);
    const widgets = dom.querySelectorAll(".rm-page-break").length;
    if (!moved && widgets === needed && widgets === last) stable++;
    else stable = 0;
    last = widgets;
  }
}

const DARK_CSS = `
  html.dark, html.dark body { background:#0b1220 !important; color:#e2e8f0 !important; }
  html.dark .ft-doc-content, html.dark .ft-doc-content * { color:#e2e8f0 !important; }
  @media (prefers-color-scheme: dark) {
    .ft-doc-content { background:#0b1220 !important; }
    .ft-doc-content p, .ft-doc-content li, .ft-doc-content td, .ft-doc-content th, .ft-doc-content h1 { color:#f8fafc !important; }
    .ft-doc-content { color-scheme: dark; }
  }
`;

function layoutOf(c: PdfCase): PrintLayoutOptions {
  return { orientation: c.orientation, margins: c.margins, customMargins: c.custom, header: c.header, footer: c.footer };
}

async function mountScreen(c: PdfCase, json: JSONContent) {
  const stage = document.getElementById("stage")!;
  stage.innerHTML = "";
  const g = resolvePageGeometry(c.size, c.orientation, c.margins, c.custom);
  const paper = document.createElement("div");
  paper.className = "ft-paper";
  paper.id = "paper";
  paper.style.cssText = `width:${g.widthPx}px;background:#fff;`;
  stage.appendChild(paper);
  const layout = layoutOf(c);
  const editor = new Editor({
    element: paper,
    extensions: printExtensions(c.size, SCREEN_PAGE_GAP_PX, layout),
    content: json,
    editable: true,
    editorProps: { attributes: { class: "ft-doc-content text-slate-700" } },
  });
  const [hl, hr] = headerFooterHtml(c.header ?? EMPTY_HEADER_FOOTER, "header");
  const [fl, fr] = headerFooterHtml(c.footer ?? EMPTY_HEADER_FOOTER, "footer");
  editor.commands.updateHeaderContent(hl, hr);
  editor.commands.updateFooterContent(fl, fr);
  await nextFrame();
  await document.fonts.ready;
  await settle(editor, paper, g.heightPx, SCREEN_PAGE_GAP_PX);
  await document.fonts.ready;
  return { stage, g, paper, editor };
}

function toBase64(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The on-screen page-break marker (dashed line + label) is editor furniture the PDF never has: hide it so the comparison is about the document. Heights are unchanged. */
function hidePageBreakMarkers() {
  if (document.getElementById("hide-pb")) return;
  const s = document.createElement("style");
  s.id = "hide-pb";
  s.textContent = ".ft-page-break { border: 0 !important; background: none !important; } .ft-page-break-label { display: none !important; }";
  document.head.appendChild(s);
}

function setDark(on: boolean) {
  const root = document.documentElement;
  document.getElementById("dark-css")?.remove();
  root.classList.toggle("dark", on);
  if (on) {
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
    const s = document.createElement("style");
    s.id = "dark-css";
    s.textContent = DARK_CSS;
    document.head.appendChild(s);
  } else {
    delete root.dataset.theme;
    root.style.colorScheme = "";
  }
}

export interface RunResult {
  case: PdfCase;
  geometry: { widthPx: number; heightPx: number; gap: number; margins: { top: number; bottom: number; left: number; right: number } };
  screen: { pages: number; firstLines: string[]; ops: Op[][]; docWords: string[]; sheetRects: { x: number; y: number; w: number; h: number }[] };
  pdf: { base64: string; pages: number; missing: string[]; timings: { layoutMs: number; collectMs: number; workerMs: number }; progress: number[]; bytes: number };
  stallMs: number;
}

/** Strips binary payloads from ops so the screen's ops can travel back to the runner as JSON. */
const lite = (sheets: { ops: Op[] }[]) => sheets.map((s) => s.ops.map((o) => (o.k === "img" ? { ...o, bytes: new Uint8Array(0) } : o)));

async function run(c: PdfCase, opts: { measureStalls?: boolean } = {}): Promise<RunResult> {
  document.getElementById("marker-sizes")?.remove();
  hidePageBreakMarkers();
  setDark(!!c.dark);
  const json = buildDoc(c.doc);
  const { stage, g, paper, editor } = await mountScreen(c, json);
  if (c.doc === "markers") {
    const style = document.createElement("style");
    style.id = "marker-sizes";
    const sizes = [12, 14, 16, 20, 24];
    style.textContent = sizes
      .flatMap((s, i) => [`.ft-doc-content > ul:nth-of-type(${i + 1}) { font-size: ${s}px; }`, `.ft-doc-content > ol:nth-of-type(${i + 1}) { font-size: ${s}px; }`])
      .join("\n");
    document.head.appendChild(style);
    await document.fonts.ready;
    await settle(editor, paper, g.heightPx, SCREEN_PAGE_GAP_PX);
  }

  const dom = editor.view.dom as HTMLElement;
  const period = g.heightPx + SCREEN_PAGE_GAP_PX;
  const top = paper.getBoundingClientRect().top;
  const blocks = Array.from(dom.children).filter((b) => !b.classList.contains("rm-pages-wrapper"));
  const lastBottom = Math.max(...blocks.slice(-3).map((b) => b.getBoundingClientRect().bottom));
  const pages = Math.max(1, Math.floor((lastBottom - top - 1) / period) + 1);
  const firstLines = collectFirstLines(paper, period).slice(0, pages);
  const docWords = editor.getText({ blockSeparator: " " }).split(/\s+/).filter(Boolean);
  const screenOps = lite(await collectLayout(dom, { origin: paper, sheetHeightPx: period, sheetCount: pages, resolveFamily: resolveDocFamily }));
  const rect = paper.getBoundingClientRect();
  const sheetRects = Array.from({ length: pages }, (_, i) => ({ x: rect.left + window.scrollX, y: rect.top + window.scrollY + i * period, w: g.widthPx, h: g.heightPx }));

  // The real export, while measuring how long the page is blocked.
  let stallMs = 0;
  let timer: number | undefined;
  if (opts.measureStalls) {
    let last = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      stallMs = Math.max(stallMs, now - last - 10);
      last = now;
    }, 10);
  }
  const progress: number[] = [];
  const result = await buildPdf({
    json: editor.getJSON(),
    size: c.size,
    layout: layoutOf(c),
    title: "Harness document",
    onProgress: (pr) => progress.push(Math.round(pr.fraction * 1000) / 1000),
  });
  if (timer) window.clearInterval(timer);
  const buf = await result.blob.arrayBuffer();

  const out: RunResult = {
    case: c,
    geometry: { widthPx: g.widthPx, heightPx: g.heightPx, gap: SCREEN_PAGE_GAP_PX, margins: { top: g.marginTopPx, bottom: g.marginBottomPx, left: g.marginLeftPx, right: g.marginRightPx } },
    screen: { pages, firstLines, ops: screenOps, docWords, sheetRects },
    pdf: { base64: toBase64(buf), pages: result.pages, missing: result.missing, timings: result.timings, progress, bytes: buf.byteLength },
    stallMs: Math.round(stallMs),
  };
  return out;
}

/** Leaves the page view mounted (for screenshots) and returns the sheet rectangles. */
async function showScreen(c: PdfCase) {
  document.getElementById("marker-sizes")?.remove();
  setDark(!!c.dark);
  const { g, paper, editor } = await mountScreen(c, buildDoc(c.doc));
  if (c.doc === "markers") {
    const style = document.createElement("style");
    style.id = "marker-sizes";
    const sizes = [12, 14, 16, 20, 24];
    style.textContent = sizes
      .flatMap((s, i) => [`.ft-doc-content > ul:nth-of-type(${i + 1}) { font-size: ${s}px; }`, `.ft-doc-content > ol:nth-of-type(${i + 1}) { font-size: ${s}px; }`])
      .join("\n");
    document.head.appendChild(style);
    await settle(editor, paper, g.heightPx, SCREEN_PAGE_GAP_PX);
  }
  const rect = paper.getBoundingClientRect();
  const dom = editor.view.dom as HTMLElement;
  const period = g.heightPx + SCREEN_PAGE_GAP_PX;
  const blocks = Array.from(dom.children).filter((b) => !b.classList.contains("rm-pages-wrapper"));
  const lastBottom = Math.max(...blocks.slice(-3).map((b) => b.getBoundingClientRect().bottom));
  const pages = Math.max(1, Math.floor((lastBottom - rect.top - 1) / period) + 1);
  return Array.from({ length: pages }, (_, i) => ({ x: rect.left + window.scrollX, y: rect.top + window.scrollY + i * period, w: g.widthPx, h: g.heightPx }));
}

/** 50-page performance run: timings, peak main-thread heap, longest main-thread stall, progress monotonicity. */
async function perf() {
  setDark(false);
  const c: PdfCase = { doc: "long", size: "LETTER", orientation: "PORTRAIT", margins: "NORMAL" };
  const json = buildDoc("long");
  const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
  const before = heap();
  let peak = before;
  const sampler = window.setInterval(() => (peak = Math.max(peak, heap())), 50);
  let last = performance.now();
  let stall = 0;
  const stallTimer = window.setInterval(() => {
    const now = performance.now();
    stall = Math.max(stall, now - last - 10);
    last = now;
  }, 10);
  const progress: number[] = [];
  const t0 = performance.now();
  const result = await buildPdf({ json, size: c.size, layout: layoutOf(c), title: "Fifty pages", onProgress: (pr) => progress.push(pr.fraction) });
  const total = performance.now() - t0;
  window.clearInterval(sampler);
  window.clearInterval(stallTimer);
  peak = Math.max(peak, heap());
  const buf = await result.blob.arrayBuffer();
  let monotonic = true;
  for (let i = 1; i < progress.length; i++) if (progress[i]! < progress[i - 1]! - 1e-9) monotonic = false;
  return {
    pages: result.pages,
    bytes: buf.byteLength,
    timings: result.timings,
    totalMs: Math.round(total),
    heapBeforeMB: Math.round(before / 1048576),
    heapPeakMB: Math.round(peak / 1048576),
    longestStallMs: Math.round(stall),
    progressEvents: progress.length,
    progressMonotonic: monotonic,
    progressEnds: progress[progress.length - 1] ?? 0,
    base64: toBase64(buf),
  };
}

/** Cancel during a 50-page export: it must stop promptly, reject with AbortError and leave nothing behind. */
async function cancel(afterFraction: number) {
  const json = buildDoc("long");
  const ac = new AbortController();
  const t0 = performance.now();
  let abortedAt = 0;
  let name = "";
  try {
    await buildPdf({
      json,
      size: "LETTER",
      layout: { orientation: "PORTRAIT", margins: "NORMAL" },
      title: "x",
      signal: ac.signal,
      onProgress: (pr) => {
        if (pr.fraction >= afterFraction && !abortedAt) {
          abortedAt = performance.now();
          ac.abort();
        }
      },
    });
  } catch (e) {
    name = e instanceof DOMException ? e.name : String(e);
  }
  await new Promise((r) => setTimeout(r, 200));
  return {
    rejectedWith: name,
    msFromAbortToReject: abortedAt ? Math.round(performance.now() - abortedAt) : -1,
    totalMs: Math.round(performance.now() - t0),
    iframesLeft: document.querySelectorAll("iframe").length,
  };
}

/** Export must be read-only: no Yjs update, no change to the shared document. */
async function readOnly() {
  const ydoc = new Y.Doc();
  const holder = document.createElement("div");
  document.body.appendChild(holder);
  const live = new Editor({ element: holder, extensions: [StarterKit.configure({ undoRedo: false }), Collaboration.configure({ document: ydoc })] });
  live.commands.setContent("<h1>Live heading</h1><p>Q1: typed by a collaborator.</p><ul><li><p>item</p></li></ul>");
  await nextFrame();
  let updates = 0;
  ydoc.on("update", () => updates++);
  const before = Y.encodeStateAsUpdate(ydoc);
  const jsonBefore = JSON.stringify(live.getJSON());
  await buildPdf({ json: live.getJSON(), size: "LETTER", layout: {}, title: "Live" });
  const after = Y.encodeStateAsUpdate(ydoc);
  const out = {
    yjsUpdates: updates,
    stateUnchanged: before.length === after.length && before.every((b, i) => b === after[i]),
    contentUnchanged: jsonBefore === JSON.stringify(live.getJSON()),
  };
  live.destroy();
  holder.remove();
  return out;
}

(window as unknown as { __pdf: object }).__pdf = { run, showScreen, perf, cancel, readOnly };
