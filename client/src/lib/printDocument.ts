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
import { resolvePageGeometry, type PageSizeKey, type PageOrientation, type MarginPresetKey, type MarginsIn } from "@shared/pageSizes";
import { FontSize } from "./fontSize";
import { LineHeight } from "./lineHeight";
import { starterKitOptions, formattingExtensions } from "./formattingExtensions";
import { paginationExtension, SCREEN_PAGE_GAP_PX } from "./pageLayout";
import { PageBreak, layoutPageBreaks } from "./pageBreak";
import { headerFooterHtml, EMPTY_HEADER_FOOTER, type HeaderFooterText } from "./headerFooter";

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

/** Page setup + header/footer text for the print copy. All optional; defaults are Normal portrait, no text. */
export interface PrintLayoutOptions {
  orientation?: PageOrientation;
  margins?: MarginPresetKey;
  /** The four margins in inches; used when `margins` is CUSTOM. */
  customMargins?: MarginsIn;
  header?: HeaderFooterText;
  footer?: HeaderFooterText;
}

export function printExtensions(size: PageSizeKey, gap: number, layout: PrintLayoutOptions = {}) {
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
    PageBreak,
    paginationExtension(size, gap, layout.orientation, layout.margins, layout.customMargins),
  ];
}


// Forcing the light theme: the app's stylesheets are cloned into the iframe, but any
// `prefers-color-scheme` rule would follow the user's OS setting there too. A sheet that has such
// rules is re-emitted with the dark conditions switched off (and the light ones always on), so the
// print copy is the document's own black-on-white whatever the app theme or OS is set to.
const NEVER = "(max-width: -1px)";
const ALWAYS = "(min-width: 0px)";

export function lightRewrite(css: string, baseHref: string): string {
  return css
    .replace(/\(\s*prefers-color-scheme\s*:\s*dark\s*\)/g, NEVER)
    .replace(/\(\s*prefers-color-scheme\s*:\s*light\s*\)/g, ALWAYS)
    // The text no longer lives at the stylesheet's own URL, so relative url()s become absolute.
    .replace(/url\(\s*(["']?)(?!data:|https?:|blob:|#)([^)"']+)\1\s*\)/g, (_m, q: string, u: string) => {
      try {
        return `url(${q}${new URL(u, baseHref).href}${q})`;
      } catch {
        return _m;
      }
    });
}

function sheetCss(sheet: CSSStyleSheet | null): string | null {
  if (!sheet) return null;
  try {
    return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
  } catch {
    return null; // cross-origin sheet: cannot be read, cloned as is
  }
}

function copyStyles(from: Document, to: Document, replaceExtensionStyle: boolean) {
  if (replaceExtensionStyle) to.querySelectorAll("style[data-rm-pagination-style]").forEach((n) => n.remove());
  from.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style').forEach((n) => {
    const isExt = n instanceof HTMLStyleElement && n.hasAttribute("data-rm-pagination-style");
    if (replaceExtensionStyle ? !isExt : false) return;
    const css = n instanceof HTMLStyleElement || n.sheet ? sheetCss(n.sheet) : null;
    if (css && /prefers-color-scheme/.test(css)) {
      const style = to.createElement("style");
      style.textContent = lightRewrite(css, n instanceof HTMLLinkElement ? n.href : from.baseURI);
      to.head.appendChild(style);
      return;
    }
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

/**
 * Waits for the document's images. Two things must never block it: ProseMirror's own hack image
 * (`img.ProseMirror-separator`, no src, in every paragraph that ends with an image: it never fires
 * load, which used to hang the export forever) and an image that never loads (broken data: gives up
 * after 8 s and simply does not draw).
 */
async function imagesLoaded(doc: Document) {
  const IMAGE_TIMEOUT_MS = 8000;
  await Promise.all(
    Array.from(doc.images)
      .filter((img) => img.getAttribute("src") && !img.classList.contains("ProseMirror-separator"))
      .map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((r) => {
              const done = () => r();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              setTimeout(done, IMAGE_TIMEOUT_MS);
            })
      )
  );
}

function countSheets(root: HTMLElement): number {
  return root.querySelectorAll(".rm-page-break").length;
}

/** First visible text of each sheet, found by vertical position relative to sheet height. */
export function collectFirstLines(root: HTMLElement, pageHeight: number): string[] {
  // `pageHeight` is the distance between two sheet starts (page height + the screen gap, if any).
  const rootTop = root.getBoundingClientRect().top;
  const lines: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  const seen = new Set<number>();
  while ((n = walker.nextNode())) {
    const text = n.textContent ?? "";
    if (!text.trim()) continue;
    const el = n.parentElement;
    // Header/footer bands and the screen-only page-break marker are not document text.
    if (!el || el.closest(".rm-pages-wrapper, .rm-first-page-header, .ft-page-break")) continue;
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


/**
 * Images other than PNG/JPEG (WebP, GIF ...) are re-encoded losslessly to PNG before the offscreen
 * copy is laid out: the PDF can only embed PNG/JPEG anyway, and decoding a WebP inside the hidden
 * iframe crashed the renderer in headless Chromium (found by e2e/pdfExport.mjs). Done in the page's
 * own document with a canvas; the live editor's content is never touched (this works on a copy).
 */
export async function rasterizeUnsupportedImages(json: JSONContent): Promise<JSONContent> {
  const cache = new Map<string, Promise<string>>();
  const convert = (src: string) => {
    let p = cache.get(src);
    if (!p) {
      p = (async () => {
        const img = new window.Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        return canvas.toDataURL("image/png");
      })().catch(() => src); // an undecodable image stays as it is (it will simply not draw)
      cache.set(src, p);
    }
    return p;
  };
  const walk = async (n: JSONContent): Promise<JSONContent> => {
    let out = n;
    const src = n.type === "image" ? (n.attrs?.src as unknown) : null;
    if (typeof src === "string" && /^data:image\//i.test(src) && !/^data:image\/(png|jpeg|jpg)[;,]/i.test(src)) {
      out = { ...n, attrs: { ...n.attrs, src: await convert(src) } };
    }
    if (n.content) out = { ...out, content: await Promise.all(n.content.map(walk)) };
    return out;
  };
  return walk(json);
}

/** A settled, read-only layout of the document at the page-setup geometry, inside a hidden iframe. */
export interface PrintCopy {
  iframe: HTMLIFrameElement;
  doc: Document;
  /** Top-left of this element is the top-left of sheet 1. */
  root: HTMLElement;
  /** The ProseMirror element (the continuous layout, all sheets stacked, gap 0). */
  pm: HTMLElement;
  geometry: ReturnType<typeof resolvePageGeometry>;
  /** Gap between sheets in this layout (the page view's own 24px for the PDF; 0 for the print fallback). */
  gap: number;
  /** Distance between two sheet starts: page height + gap. */
  period: number;
  /** Sheets in the layout (same rule as the page view: bottom of the last block, in whole sheets). */
  pageCount: number;
  firstLines: string[];
  /** Blob URLs created for this copy (revoked by destroy()). */
  blobUrls: string[];
  /** Removes the editor but keeps the laid-out DOM (used before freezing for printing). */
  unmount: () => void;
  destroy: () => void;
}

/**
 * Lays the document out offscreen, exactly as the page view does (same extensions, same CSS and
 * fonts, gap 0), in a fresh iframe so nothing of the app (dark theme, UI scale) can leak in: the
 * iframe is forced to the light color scheme and every dark-mode media rule of the app's
 * stylesheets is switched off, so the colors are always the document's own (black text on white).
 * Both the PDF download and the print copy start here. Read-only: never touches the live editor.
 */
export async function layoutPrintCopy(
  rawJson: JSONContent,
  size: PageSizeKey,
  layout: PrintLayoutOptions = {},
  /**
   * Gap between sheets. The PDF lays out with the page view's own gap so the two layouts are the same
   * by construction (the extension's spacer arithmetic is not exactly the same at gap 0; at zero margins
   * a page drifted by 2px). The print-window fallback slices this same layout.
   */
  gap: number = SCREEN_PAGE_GAP_PX
): Promise<PrintCopy> {
  const json = await rasterizeUnsupportedImages(rawJson);
  const def = resolvePageGeometry(size, layout.orientation, layout.margins, layout.customMargins);
  const period = def.heightPx + gap;
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  // Laid out (not display:none) so the extension can measure; parked off-screen at EXACT page width.
  iframe.style.cssText = `position:fixed;left:-99999px;top:0;width:${def.widthPx}px;height:${def.heightPx}px;border:0;visibility:hidden;color-scheme:light;`;
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(
    `<!doctype html><html lang="en" data-theme="light" style="color-scheme:light"><head><meta charset="utf-8"><meta name="color-scheme" content="only light"><title></title></head><body><div id="print-root"></div></body></html>`
  );
  doc.close();
  copyStyles(document, doc, false);

  const printCss = doc.createElement("style");
  printCss.textContent = `
    html, body { margin: 0; padding: 0; background: #fff; color-scheme: light; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    #print-root { width: ${def.widthPx}px; overflow: hidden; background: #fff; }
    #print-root .ProseMirror { outline: none; border: 0 !important; background: #fff; }
    #print-root .ProseMirror * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    ${gap === 0 ? "#print-root .rm-pagination-gap { display: none; }" : ""}
    .ft-page-break { height: auto; border: 0 !important; background: none !important; }
    .ft-page-break-label { display: none !important; }
  `;
  doc.head.appendChild(printCss);

  const root = doc.getElementById("print-root") as HTMLElement;
  let editor: Editor | null = null;
  const mount = () => {
    editor = new Editor({
      element: root,
      extensions: printExtensions(size, gap, layout),
      content: json,
      editable: false,
      editorProps: { attributes: { class: "ft-doc-content text-slate-700" } },
    });
    // The extension injects its stylesheet into the MAIN document's head; mirror it into the frame.
    copyStyles(document, doc, true);
    // Header/footer text set by the students (plain text; the app adds none of its own).
    const [hl, hr] = headerFooterHtml(layout.header ?? EMPTY_HEADER_FOOTER, "header");
    const [fl, fr] = headerFooterHtml(layout.footer ?? EMPTY_HEADER_FOOTER, "footer");
    editor!.commands.updateHeaderContent(hl, hr);
    editor!.commands.updateFooterContent(fl, fr);
  };
  const unmount = () => {
    try { editor?.destroy(); } catch { /* already gone */ }
    editor = null;
    root.innerHTML = "";
  };

  const blobUrls: string[] = [];
  const destroy = () => {
    unmount();
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
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
      return { widgets: countSheets(root), needed: Math.max(1, Math.floor((bottom - top - 1) / period) + 1) };
    };
    let stable = 0;
    let last = -1;
    for (let i = 0; i < 60 && stable < 3; i++) {
      editor!.view.dispatch(editor!.state.tr);
      await nextFrame();
      // Page breaks size themselves from the sheet bands, so they settle with the sheet count.
      const breaksMoved = layoutPageBreaks(root.querySelector<HTMLElement>(".ProseMirror")!, period);
      const m = measure();
      if (!breaksMoved && m.widgets === m.needed && m.widgets === last) stable++;
      else stable = 0;
      last = m.widgets;
    }
    // Sheet count from the CONTENT (bottom of the last real block), not the widget count: the
    // extension's trailing widget can lag the layout by one sheet.
    const pm = root.querySelector<HTMLElement>(".ProseMirror")!;
    const rootTop = root.getBoundingClientRect().top;
    const blocks = Array.from(pm.children).filter((c) => !c.classList.contains("rm-pages-wrapper"));
    const lastBottom = blocks.length ? Math.max(...blocks.slice(-3).map((c) => c.getBoundingClientRect().bottom)) : rootTop;
    const pageCount = Math.max(1, Math.floor((lastBottom - rootTop - 1) / period) + 1);
    const firstLines = collectFirstLines(root, period).slice(0, pageCount);
    return { iframe, doc, root, pm, geometry: def, gap, period, pageCount, firstLines, blobUrls, unmount, destroy };
  } catch (err) {
    destroy();
    throw err;
  }
}

export async function buildPrintFrame(json: JSONContent, size: PageSizeKey, layout: PrintLayoutOptions = {}): Promise<PrintFrame> {
  // Same layout as the page view (gap included); each sheet clips its own window of it.
  const copy = await layoutPrintCopy(json, size, layout);
  const { iframe, doc, root, pm, geometry: def, period, pageCount, firstLines } = copy;
  try {
    // Chrome's own print fragmentation mangles the extension's float spacers (margins are truncated
    // at every page break, drifting text by tens of px per sheet). So never let the browser split
    // the continuous layout: freeze it into one fixed-size clipping box per sheet, each showing the
    // same layout shifted up by sheet-index x pageHeight. Real DOM text (selectable), identical
    // breaks to the screen by construction, total height exactly pageCount x pageHeight.
    // Each sheet clips to its own box (overflow + contain: paint + clip-path), so no line can show on
    // two printed pages; the last sheet is 1px short so sub-pixel rounding can never add a blank page.
    const printCss = doc.createElement("style");
    printCss.textContent = `
      @page { size: ${def.cssWidth} ${def.cssHeight}; margin: 0; }
      html, body { height: auto; overflow: hidden; }
      #print-sheets { margin: 0; padding: 0; background: #fff; }
      .print-sheet { position: relative; width: ${def.widthPx}px; height: ${def.heightPx}px; overflow: hidden; contain: paint; clip-path: inset(0); background: #fff; break-after: page; page-break-after: always; break-inside: avoid; }
      .print-sheet:last-child { height: ${def.heightPx - 1}px; break-after: avoid; page-break-after: avoid; }
      .print-slice { position: absolute; left: 0; width: ${def.widthPx}px; }
      .print-slice .ProseMirror { outline: none; border: 0 !important; background: #fff; }
      .print-slice .ProseMirror * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `;
    doc.head.appendChild(printCss);

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
        const bin = atob(m[2]!);
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
      slice.style.top = `-${i * period}px`;
      slice.appendChild(i === 0 ? frozen : (frozen.cloneNode(true) as HTMLElement));
      sheet.appendChild(slice);
      sheets.appendChild(sheet);
    }
    blobUrls.forEach((u) => copy.blobUrls.push(u));
    copy.unmount();
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
    return { iframe, pageCount, firstLines, print, destroy: copy.destroy };
  } catch (err) {
    copy.destroy();
    throw err;
  }
}

/** Build the frame, open the browser print dialog ("Save as PDF"), then tear everything down. */
export async function printDocument(json: JSONContent, size: PageSizeKey, layout: PrintLayoutOptions = {}): Promise<void> {
  const frame = await buildPrintFrame(json, size, layout);
  try {
    await frame.print();
  } finally {
    frame.destroy();
  }
}
