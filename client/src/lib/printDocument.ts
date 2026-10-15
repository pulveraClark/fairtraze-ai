import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import FontFamily from "@tiptap/extension-font-family";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import type { JSONContent } from "@tiptap/core";
import { PAGE_SIZES, type PageSizeKey } from "@shared/pageSizes";
import { FontSize } from "./fontSize";
import { LineHeight } from "./lineHeight";
import { starterKitOptions, formattingExtensions } from "./formattingExtensions";
import { paginationExtension } from "./pageLayout";

// Clean PDF export. A SEPARATE, read-only TipTap instance is mounted inside a hidden iframe and
// loaded with a snapshot of the document (editor.getJSON()). It has no Collaboration/Yjs, no
// authorship/comment/cursor plugins and no selection, so none of that can leak into the output;
// user formatting (Highlight, text color, tables, images) is plain document content and stays.
// It uses the same pagination config as the screen except gap = 0, and the same CSS/fonts, so the
// extension computes its own spacers there. Page breaks depend on page height/margins/width/fonts,
// not on the gap. Read-only: nothing here ever touches the live editor, the Y.Doc, or the server.

export interface PrintFrame {
  iframe: HTMLIFrameElement;
  /** Sheets in the print layout (one `.rm-page-break` per sheet, including the last). */
  pageCount: number;
  /** First rendered text line of each sheet, for screen-vs-PDF comparison. */
  firstLines: string[];
  print: () => Promise<void>;
  destroy: () => void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function printExtensions(size: PageSizeKey, gap: number) {
  return [
    StarterKit.configure(starterKitOptions),
    ...formattingExtensions,
    Table,
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Image.configure({ allowBase64: true }),
    FontFamily,
    FontSize,
    LineHeight,
    Superscript,
    Subscript,
    paginationExtension(size, gap),
  ];
}

function copyStyles(from: Document, to: Document, replaceExtensionStyle: boolean) {
  if (replaceExtensionStyle) to.querySelectorAll("style[data-rm-pagination-style]").forEach((n) => n.remove());
  from.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
    const isExt = n instanceof HTMLStyleElement && n.hasAttribute("data-rm-pagination-style");
    if (replaceExtensionStyle ? !isExt : false) return;
    to.head.appendChild(n.cloneNode(true));
  });
}

/** <link rel=stylesheet> clones load asynchronously — measuring before they apply gives wrong breaks. */
async function stylesheetsLoaded(doc: Document) {
  await Promise.all(
    Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map((l) =>
      l.sheet ? Promise.resolve() : new Promise<void>((r) => {
        l.addEventListener("load", () => r(), { once: true });
        l.addEventListener("error", () => r(), { once: true });
      })
    )
  );
}

async function imagesLoaded(doc: Document) {
  await Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise<void>((r) => {
        img.addEventListener("load", () => r(), { once: true });
        img.addEventListener("error", () => r(), { once: true });
      })
    )
  );
}

function countSheets(root: HTMLElement): number {
  return root.querySelectorAll(".rm-page-break").length;
}

/** First visible text of each sheet, found by vertical position relative to sheet height. */
export function collectFirstLines(root: HTMLElement, pageHeight: number): string[] {
  const rootTop = root.getBoundingClientRect().top;
  const lines: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  const seen = new Set<number>();
  while ((n = walker.nextNode())) {
    const text = n.textContent ?? "";
    if (!text.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest(".rm-pages-wrapper")) continue;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(n);
    for (const rect of Array.from(range.getClientRects())) {
      if (rect.height === 0) continue;
      const sheet = Math.floor((rect.top - rootTop + rect.height / 2) / pageHeight);
      if (!seen.has(sheet)) { seen.add(sheet); lines[sheet] = text.trim().slice(0, 24); }
    }
  }
  return lines;
}

export async function buildPrintFrame(json: JSONContent, size: PageSizeKey): Promise<PrintFrame> {
  const def = PAGE_SIZES[size];
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  // Laid out (not display:none) so the extension can measure; parked off-screen at EXACT page width.
  iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${def.widthPx}px;height:${def.heightPx}px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><div id="print-root"></div></body></html>`);
  doc.close();
  copyStyles(document, doc, false);

  const printCss = doc.createElement("style");
  printCss.textContent = `
    @page { size: ${def.cssWidth} ${def.cssHeight}; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #print-root { width: ${def.widthPx}px; overflow: hidden; background: #fff; }
    #print-root .ProseMirror { outline: none; border: 0 !important; background: #fff; }
    #print-root .ProseMirror * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #print-root .rm-pagination-gap { display: none; }
    #print-sheets { margin: 0; padding: 0; background: #fff; }
    .print-sheet { position: relative; width: ${def.widthPx}px; height: ${def.cssHeight}; overflow: hidden; background: #fff; break-after: page; page-break-after: always; break-inside: avoid; }
    .print-sheet:last-child { break-after: auto; page-break-after: auto; }
    .print-slice { position: absolute; left: 0; width: ${def.widthPx}px; }
    .print-slice .ProseMirror { outline: none; border: 0 !important; background: #fff; }
    .print-slice .ProseMirror * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .print-slice .rm-pagination-gap { display: none; }
  `;
  doc.head.appendChild(printCss);

  const root = doc.getElementById("print-root") as HTMLElement;
  let editor: Editor | null = null;
  const mount = () => {
    editor = new Editor({
      element: root,
      extensions: printExtensions(size, 0),
      content: json,
      editable: false,
      editorProps: { attributes: { class: "ft-doc-content text-slate-700" } },
    });
    // The extension injects its stylesheet into the MAIN document's head; mirror it into the frame.
    copyStyles(document, doc, true);
  };
  const unmount = () => {
    try { editor?.destroy(); } catch { /* already gone */ }
    editor = null;
    root.innerHTML = "";
  };

  const blobUrlsToRevoke: string[] = [];
  const destroy = () => {
    unmount();
    blobUrlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    iframe.remove();
  };

  try {
    // The extension paginates from measured heights at creation/update time, so it must never
    // measure before CSS, web fonts and images are in place (it does not re-measure on its own).
    // Pass 1 warms everything (stylesheets, font files, image decode); pass 2 is the real layout.
    await stylesheetsLoaded(doc);
    await nextFrame();
    mount();
    await nextFrame();
    await doc.fonts.ready;
    await imagesLoaded(doc);
    unmount();
    mount();
    await nextFrame();
    await nextFrame();
    await doc.fonts.ready;
    await imagesLoaded(doc);
    await nextFrame();
    // The extension sizes its page widgets in the plugin's state.apply from the DOM as it was
    // BEFORE that transaction, adding pages incrementally — so a freshly loaded doc is always a step
    // behind. Feed it empty transactions until the widget count matches the content and holds.
    const measure = () => {
      const pmEl = root.querySelector<HTMLElement>(".ProseMirror")!;
      const top = root.getBoundingClientRect().top;
      const real = Array.from(pmEl.children).filter((c) => !c.classList.contains("rm-pages-wrapper"));
      const bottom = real.length ? Math.max(...real.slice(-3).map((c) => c.getBoundingClientRect().bottom)) : top;
      return { widgets: countSheets(root), needed: Math.max(1, Math.floor((bottom - top - 1) / def.heightPx) + 1) };
    };
    let stable = 0;
    let last = -1;
    for (let i = 0; i < 60 && stable < 3; i++) {
      editor!.view.dispatch(editor!.state.tr);
      await nextFrame();
      const m = measure();
      if (m.widgets === m.needed && m.widgets === last) stable++;
      else stable = 0;
      last = m.widgets;
    }
    // Sheet count from the CONTENT (bottom of the last real block), not the widget count: the
    // extension's trailing widget can lag the layout by one sheet.
    const pm = root.querySelector<HTMLElement>(".ProseMirror")!;
    const rootTop = root.getBoundingClientRect().top;
    const blocks = Array.from(pm.children).filter((c) => !c.classList.contains("rm-pages-wrapper"));
    const lastBottom = blocks.length ? Math.max(...blocks.slice(-3).map((c) => c.getBoundingClientRect().bottom)) : rootTop;
    const pageCount = Math.max(1, Math.floor((lastBottom - rootTop - 1) / def.heightPx) + 1);
    const firstLines = collectFirstLines(root, def.heightPx).slice(0, pageCount);

    // Chrome's own print fragmentation mangles the extension's float spacers (margins are truncated
    // at every page break, drifting text by tens of px per sheet). So never let the browser split
    // the continuous layout: freeze it into one fixed-size clipping box per sheet, each showing the
    // same layout shifted up by sheet-index x pageHeight. Real DOM text (selectable), identical
    // breaks to the screen by construction, total height exactly pageCount x pageHeight.
    const sheets = doc.createElement("div");
    sheets.id = "print-sheets";
    const blobUrls = new Map<string, string>();
    const frozen = pm.cloneNode(true) as HTMLElement;
    frozen.removeAttribute("contenteditable");
    frozen.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const src = img.getAttribute("src") ?? "";
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(src);
      if (!m) return;
      if (!blobUrls.has(src)) {
        const bin = atob(m[2]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blobUrls.set(src, URL.createObjectURL(new Blob([bytes], { type: m[1] })));
      }
      img.setAttribute("src", blobUrls.get(src)!);
    });
    for (let i = 0; i < pageCount; i++) {
      const sheet = doc.createElement("div");
      sheet.className = "print-sheet";
      const slice = doc.createElement("div");
      slice.className = "print-slice";
      slice.style.top = `-${i * def.heightPx}px`;
      slice.appendChild(i === 0 ? frozen : (frozen.cloneNode(true) as HTMLElement));
      sheet.appendChild(slice);
      sheets.appendChild(sheet);
    }
    blobUrls.forEach((u) => blobUrlsToRevoke.push(u));
    unmount();
    root.remove();
    doc.body.appendChild(sheets);
    await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
    await nextFrame();

    const print = () =>
      new Promise<void>((resolve) => {
        const win = iframe.contentWindow!;
        const done = () => { win.removeEventListener("afterprint", done); resolve(); };
        win.addEventListener("afterprint", done);
        win.focus();
        win.print();
      });
    return { iframe, pageCount, firstLines, print, destroy };
  } catch (err) {
    destroy();
    throw err;
  }
}

/** Build the frame, open the browser print dialog ("Save as PDF"), then tear everything down. */
export async function printDocument(json: JSONContent, size: PageSizeKey): Promise<void> {
  const frame = await buildPrintFrame(json, size);
  try {
    await frame.print();
  } finally {
    frame.destroy();
  }
}
