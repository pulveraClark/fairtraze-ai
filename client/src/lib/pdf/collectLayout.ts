import { isSafeLinkUrl } from "@shared/linkUrl";
import type { FontFace, Op, Rgba, SheetOps } from "./ops";

// Walks the settled, read-only print layout and turns it into per-sheet draw ops. Positions come
// from the browser itself (getBoundingClientRect / Range.getClientRects), never re-derived from
// CSS, so line breaks, justify, indent and line height match the screen. Runs on the main thread
// (it needs the DOM) in small slices, yielding so the page stays responsive, and can be aborted.

/** Screen-only or editor-only furniture that is never part of the document. */
const SKIP = ".ft-page-break, [data-resize-handle], .rm-pagination-gap, .collaboration-cursor__caret, .ProseMirror-gapcursor";
/** The page extension's header/footer bands (their text is real, their boxes are not drawn). */
const BAND = ".rm-pages-wrapper, .rm-first-page-header";

export interface CollectOptions {
  /** The element whose top-left is the top-left of sheet 1. */
  origin: HTMLElement;
  sheetHeightPx: number;
  /** Sheets in the layout (a trailing blank sheet is still a sheet, as on screen). */
  sheetCount: number;
  /** Maps a computed `font-family` list to the bundled family name. */
  resolveFamily: (cssFamily: string) => string;
  signal?: AbortSignal;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

// Computed colors can be oklch()/color() (Tailwind v4), not just rgb(); a 1x1 canvas converts any
// CSS color the browser understands to sRGB bytes.
let swatch: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, Rgba>();
export function parseColor(s: string): Rgba {
  const hit = colorCache.get(s);
  if (hit) return hit;
  // rgb()/rgba() carry exact values (a canvas would quantise low-alpha colors); parse them directly.
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1]!.split(/[,/ ]+/).filter(Boolean).map(Number);
    const rgb = { r: p[0]!, g: p[1]!, b: p[2]!, a: p[3] ?? 1 };
    colorCache.set(s, rgb);
    return rgb;
  }
  swatch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  swatch.canvas.width = swatch.canvas.height = 1;
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = "#000";
  swatch.fillStyle = s;
  swatch.fillRect(0, 0, 1, 1);
  const d = swatch.getImageData(0, 0, 1, 1).data;
  const out = { r: d[0]!, g: d[1]!, b: d[2]!, a: s === "transparent" ? 0 : d[3]! / 255 };
  colorCache.set(s, out);
  return out;
}
const isWhite = (c: Rgba) => c.a === 1 && c.r === 255 && c.g === 255 && c.b === 255;

const SHOW_TEXT = 4;

export async function collectLayout(root: HTMLElement, opts: CollectOptions): Promise<SheetOps[]> {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const cs = (e: Element) => win.getComputedStyle(e);
  const o = opts.origin.getBoundingClientRect();
  const H = opts.sheetHeightPx;
  // The text layer is written in DOCUMENT order (so extracted/copied text reads right: a list number
  // comes before its item, headers and footers where they sit); every text-like op carries its key.
  const layers: { bg: Op[][]; text: { seq: number; op: Op }[][]; fg: Op[][] } = { bg: [], text: [], fg: [] };
  const order = new Map<Node, number>();
  {
    const all = doc.createTreeWalker(root, 5 /* elements + text */);
    let i = 0;
    for (let n: Node | null = all.currentNode; n; n = all.nextNode()) order.set(n, i++);
  }
  const seqOf = (n: Node) => order.get(n) ?? 0;
  const pushText = (sheet: number, seq: number, op: Op) => {
    sheetCount = Math.max(sheetCount, sheet + 1);
    (layers.text[sheet] ??= []).push({ seq, op });
  };
  let sheetCount = opts.sheetCount;
  const push = (layer: Op[][], sheet: number, op: Op) => {
    sheetCount = Math.max(sheetCount, sheet + 1);
    (layer[sheet] ??= []).push(op);
  };
  /** Sheet index and sheet-relative top for a client rect, by its vertical centre. */
  const place = (r: { top: number; height: number }) => {
    const rel = r.top - o.top;
    const sheet = Math.max(0, Math.floor((rel + r.height / 2) / H));
    return { sheet, top: rel - sheet * H };
  };
  const skipped = (n: Node) => !!(n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(SKIP);
  const inBand = (el: Element) => !!el.closest(BAND);
  // Visually hidden text (screen-reader-only labels such as a checklist item's "Task item checkbox
  // for ..."): a 1px box that clips its content, or display/visibility hidden. Never drawn.
  const hiddenCache = new Map<Element, boolean>();
  const isHidden = (el: Element): boolean => {
    const hit = hiddenCache.get(el);
    if (hit !== undefined) return hit;
    const s = cs(el);
    let hidden = s.display === "none" || s.visibility === "hidden";
    if (!hidden && s.overflow !== "visible") {
      const r = el.getBoundingClientRect();
      hidden = r.width <= 1 && r.height <= 1;
    }
    if (!hidden && el.parentElement && el !== root) hidden = isHidden(el.parentElement);
    hiddenCache.set(el, hidden);
    return hidden;
  };
  const faceOf = (style: CSSStyleDeclaration): FontFace => ({
    family: opts.resolveFamily(style.fontFamily),
    weight: parseInt(style.fontWeight, 10) >= 600 ? 700 : 400,
    italic: style.fontStyle === "italic" || style.fontStyle === "oblique",
  });

  // Cooperative scheduling: yield to the page every ~16 ms and honour Cancel.
  let lastYield = performance.now();
  const aborted = () => new DOMException("PDF export cancelled", "AbortError");
  const tick = async () => {
    if (opts.signal?.aborted) throw aborted();
    if (performance.now() - lastYield > 16) {
      await new Promise<void>((r) => setTimeout(r, 0));
      lastYield = performance.now();
      if (opts.signal?.aborted) throw aborted();
    }
  };

  const elements = Array.from(root.querySelectorAll<HTMLElement>("*"));
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (t.data.trim() && t.parentElement && !skipped(t) && !isHidden(t.parentElement)) texts.push(t);
  }
  const total = elements.length + texts.length + 1;
  let done = 0;
  const bump = () => {
    done++;
    if (done % 64 === 0) opts.onProgress?.(Math.min(0.99, done / total));
  };

  // ── backgrounds (highlight, shading) and borders ───────────────────────────────────────────
  for (const el of elements) {
    bump();
    await tick();
    if (skipped(el) || inBand(el) || el.tagName === "BR" || el.tagName === "IMG" || isHidden(el)) continue;
    const style = cs(el);
    const inline = style.display.startsWith("inline");
    const bg = parseColor(style.backgroundColor);
    if (bg.a > 0 && !isWhite(bg)) {
      const rects: DOMRect[] = [];
      if (inline) {
        const r = doc.createRange();
        r.selectNodeContents(el);
        rects.push(...Array.from(r.getClientRects()));
      } else rects.push(el.getBoundingClientRect());
      for (const r of rects) {
        if (r.width <= 0 || r.height <= 0) continue;
        const p = place(r);
        push(layers.bg, p.sheet, { k: "rect", x: r.left - o.left, y: p.top, w: r.width, h: r.height, c: bg });
      }
    }
    if (inline) continue;
    const sides = [
      ["Top", style.borderTopWidth, style.borderTopStyle, style.borderTopColor],
      ["Bottom", style.borderBottomWidth, style.borderBottomStyle, style.borderBottomColor],
      ["Left", style.borderLeftWidth, style.borderLeftStyle, style.borderLeftColor],
      ["Right", style.borderRightWidth, style.borderRightStyle, style.borderRightColor],
    ] as const;
    if (!sides.some(([, w, s]) => parseFloat(w) > 0 && s !== "none" && s !== "hidden")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const collapsed = el.tagName === "TD" || el.tagName === "TH";
    const p = place(r);
    const x0 = r.left - o.left;
    const y0 = p.top;
    for (const [side, wStr, bstyle, col] of sides) {
      const w = parseFloat(wStr);
      if (!(w > 0) || bstyle === "none" || bstyle === "hidden") continue;
      const c = parseColor(col);
      // Collapsed table borders sit centred on the grid line; the cell's rect edge is that line.
      const off = collapsed ? w / 2 : 0;
      const rect =
        side === "Top" ? { x: x0 - off, y: y0 - off, w: r.width + 2 * off, h: w } :
        side === "Bottom" ? { x: x0 - off, y: y0 + r.height - w + off, w: r.width + 2 * off, h: w } :
        side === "Left" ? { x: x0 - off, y: y0 - off, w, h: r.height + 2 * off } :
        { x: x0 + r.width - w + off, y: y0 - off, w, h: r.height + 2 * off };
      push(layers.bg, p.sheet, { k: "rect", ...rect, c });
    }
  }

  // ── text ───────────────────────────────────────────────────────────────────────────────────
  const range = doc.createRange();
  /** The nearest ancestor (inline or block) that declares this decoration, with its color. */
  const decorationOf = (el: Element, line: "underline" | "line-through"): Rgba | null => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const s = cs(e);
      if (s.textDecorationLine.includes(line)) return parseColor(s.textDecorationColor);
      // Decorations do not propagate into inline-blocks, floats or absolutely positioned boxes.
      if (s.display === "inline-block" || s.cssFloat !== "none" || s.position === "absolute") return null;
    }
    return null;
  };

  for (const text of texts) {
    bump();
    await tick();
    const el = text.parentElement!;
    const style = cs(el);
    const face = faceOf(style);
    const size = parseFloat(style.fontSize);
    const c = parseColor(style.color);
    const link = el.closest("a[href]");
    const href = link?.getAttribute("href") ?? "";
    const safeLink = link && isSafeLinkUrl(href) ? href : null;
    const re = /\S+/g;
    for (let m = re.exec(text.data); m; m = re.exec(text.data)) {
      const word = m[0];
      range.setStart(text, m.index);
      range.setEnd(text, m.index + word.length);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      if (!rects.length) continue;
      const trailing = /\s/.test(text.data[m.index + word.length] ?? "") ? " " : "";
      if (rects.length === 1) {
        const r = rects[0]!;
        const p = place(r);
        pushText(p.sheet, seqOf(text) + m.index / 1e6, { k: "text", s: word + trailing, x: r.left - o.left, top: p.top, w: r.width, face, size, c });
        continue;
      }
      // A long word or URL that wraps: one op per line fragment, split by measuring each character.
      const frags: { s: string; left: number; right: number; top: number; height: number }[] = [];
      let offset = m.index;
      for (const ch of word) {
        range.setStart(text, offset);
        range.setEnd(text, offset + ch.length);
        offset += ch.length;
        const cr = range.getClientRects()[0];
        if (!cr || cr.width === 0) continue;
        const last = frags[frags.length - 1];
        if (last && Math.abs(cr.top - last.top) < Math.max(2, size * 0.4)) {
          last.s += ch;
          last.right = cr.right;
        } else frags.push({ s: ch, left: cr.left, right: cr.right, top: cr.top, height: cr.height });
      }
      frags.forEach((f, i) => {
        const p = place(f);
        pushText(p.sheet, seqOf(text) + (m.index + i / 1e3) / 1e6, {
          k: "text", s: f.s + (i === frags.length - 1 ? trailing : ""), x: f.left - o.left, top: p.top, w: f.right - f.left, face, size, c,
        });
      });
    }
    // Per-line runs for decorations and links.
    const under = decorationOf(el, "underline");
    const strike = decorationOf(el, "line-through");
    if (under || strike || safeLink) {
      range.selectNodeContents(text);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width === 0) continue;
        const p = place(r);
        if (under) push(layers.fg, p.sheet, { k: "deco", kind: "underline", x: r.left - o.left, top: p.top, w: r.width, face, size, c: under });
        if (strike) push(layers.fg, p.sheet, { k: "deco", kind: "strike", x: r.left - o.left, top: p.top, w: r.width, face, size, c: strike });
        if (safeLink) push(layers.fg, p.sheet, { k: "link", x: r.left - o.left, y: p.top, w: r.width, h: r.height, uri: safeLink });
      }
    }
  }

  // ── header / footer page numbers (CSS-counter pseudo content, not DOM text) ─────────────────
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(".rm-page-number, .rm-page-number-plus"))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const p = place(r);
    const content = win.getComputedStyle(el, "::before").content.replace(/^["']|["']$/g, "");
    const label = /^\d+$/.test(content) ? content : String(p.sheet + 1);
    const style = cs(el);
    pushText(p.sheet, seqOf(el), { k: "text", s: label, x: r.left - o.left, top: p.top, w: r.width, face: faceOf(style), size: parseFloat(style.fontSize), c: parseColor(style.color) });
  }

  // ── list markers (not DOM text) ────────────────────────────────────────────────────────────
  for (const li of Array.from(root.querySelectorAll<HTMLElement>("li"))) {
    if (skipped(li) || li.parentElement?.getAttribute("data-type") === "taskList") continue;
    await tick();
    const lstyle = cs(li);
    const type = lstyle.listStyleType;
    if (type !== "disc" && type !== "circle" && type !== "square" && type !== "decimal") continue;
    const first = firstTextRect(li, doc);
    if (!first) continue;
    const firstSeq = seqOf(first.node) - 0.5;
    const p = place(first.rect);
    const tstyle = cs(first.el);
    let label = "";
    if (type === "decimal") {
      const list = li.parentElement!;
      const start = parseInt(list.getAttribute("start") ?? "1", 10) || 1;
      const idx = Array.from(list.children).filter((x) => x.tagName === "LI").indexOf(li);
      label = `${start + idx}. `;
    }
    pushText(p.sheet, firstSeq, {
      k: "marker", kind: type === "decimal" ? "number" : type, label, x: first.rect.left - o.left,
      line: { top: p.top, face: faceOf(tstyle), size: parseFloat(tstyle.fontSize) },
      face: faceOf(lstyle), size: parseFloat(lstyle.fontSize), c: parseColor(lstyle.color),
    });
  }

  // ── checklist boxes ────────────────────────────────────────────────────────────────────────
  for (const box of Array.from(root.querySelectorAll<HTMLInputElement>('ul[data-type="taskList"] > li input[type="checkbox"]'))) {
    if (skipped(box)) continue;
    const r = box.getBoundingClientRect();
    if (r.width === 0) continue;
    const p = place(r);
    const accent = cs(box).accentColor;
    push(layers.fg, p.sheet, {
      k: "check", x: r.left - o.left, y: p.top, w: r.width, h: r.height, checked: box.checked || box.hasAttribute("checked") || box.closest("li")?.getAttribute("data-checked") === "true",
      accent: accent === "auto" ? { r: 0, g: 117, b: 255, a: 1 } : parseColor(accent),
    });
  }

  // ── images ─────────────────────────────────────────────────────────────────────────────────
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    if (skipped(img) || !img.complete || !img.naturalWidth) continue;
    await tick();
    const r = img.getBoundingClientRect();
    const p = place(r);
    const { bytes, mime } = await imageBytes(img, doc);
    push(layers.fg, p.sheet, { k: "img", x: r.left - o.left, y: p.top, w: r.width, h: r.height, mime, bytes });
  }

  opts.onProgress?.(1);
  return Array.from({ length: sheetCount }, (_, i) => ({
    ops: [
      ...(layers.bg[i] ?? []),
      ...(layers.text[i] ?? []).sort((a, b) => a.seq - b.seq).map((t) => t.op),
      ...(layers.fg[i] ?? []),
    ],
  }));
}

/** The first non-blank text that belongs to this item itself (not to a nested list), as its first character's rect. */
function firstTextRect(li: HTMLElement, doc: Document): { rect: DOMRect; el: HTMLElement; node: Text } | null {
  const w = doc.createTreeWalker(li, SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest("ul, ol") === li.parentElement && /\S/.test((n as Text).data) ? 1 /* ACCEPT */ : 2 /* REJECT */,
  });
  const n = w.nextNode() as Text | null;
  if (!n) return null;
  const range = doc.createRange();
  const i = n.data.search(/\S/);
  range.setStart(n, i);
  range.setEnd(n, i + 1);
  const rect = range.getClientRects()[0];
  return rect ? { rect, el: n.parentElement!, node: n } : null;
}

async function imageBytes(img: HTMLImageElement, doc: Document): Promise<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" }> {
  const res = await fetch(img.currentSrc || img.src); // data:/blob: only; never a network request
  const blob = await res.blob();
  if (blob.type === "image/png" || blob.type === "image/jpeg") return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type };
  // WebP, GIF, anything else the browser can draw: re-encoded losslessly to PNG.
  const canvas = doc.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  const png = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
  return { bytes: new Uint8Array(await png.arrayBuffer()), mime: "image/png" };
}
