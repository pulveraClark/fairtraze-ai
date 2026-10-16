/// <reference lib="webworker" />
import { PDFDocument, PDFName, PDFString, PDFArray, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { faceKey, type FontFace, type LineRef, type PdfJob, type Rgba, type WorkerMessage } from "./ops";

// Writes the vector PDF from the op list (see ops.ts / collectLayout.ts). Runs in a Web Worker so
// the page never freezes: it needs no DOM, only pdf-lib + fontkit and the bundled font files.

const PT = 0.75; // 1 CSS px = 0.75 pt

interface FKFont {
  ascent: number;
  unitsPerEm: number;
  underlinePosition: number;
  underlineThickness: number;
  hasGlyphForCodePoint(cp: number): boolean;
}
interface Part { url: string; fk: FKFont; bytes: Uint8Array }
interface Chain { parts: Part[] }

// Characters that carry no visible glyph and must not be reported as "missing".
const INVISIBLE_RANGES: [number, number][] = [
  [0x0000, 0x001f], [0x007f, 0x007f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff],
];
const isInvisible = (cp: number) => INVISIBLE_RANGES.some(([a, b]) => cp >= a && cp <= b);

async function build(job: PdfJob, progress: (done: number, total: number) => void): Promise<{ bytes: Uint8Array; missing: string[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(job.title);
  doc.setCreator("FairTraze Docs");
  doc.setProducer("FairTraze Docs (pdf-lib)");
  const missing = new Set<string>();

  // One fetched + parsed file per URL, shared by every face whose chain contains it.
  const parts = new Map<string, Promise<Part>>();
  const loadPart = (url: string) => {
    let p = parts.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Could not load a font file (${r.status}).`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          const bytes = new Uint8Array(buf);
          return { url, bytes, fk: fontkit.create(bytes) as unknown as FKFont };
        });
      parts.set(url, p);
    }
    return p;
  };
  const chains = new Map<string, Promise<Chain>>();
  const chainOf = (face: FontFace): Promise<Chain> => {
    const key = faceKey(face);
    let c = chains.get(key);
    if (!c) {
      const urls = job.fontChains[key];
      if (!urls?.length) throw new Error(`No font files for ${key}`);
      c = Promise.all(urls.map(loadPart)).then((p) => ({ parts: p }));
      chains.set(key, c);
    }
    return c;
  };
  // Embedded subset per (file, tabular-figures) - created only for files a character actually uses.
  const embedded = new Map<string, Promise<PDFFont>>();
  const fontFor = (part: Part, tnum: boolean) => {
    const key = part.url + (tnum ? "|tnum" : "");
    let f = embedded.get(key);
    if (!f) {
      f = doc.embedFont(part.bytes, { subset: true, ...(tnum ? { features: { tnum: true } } : {}) });
      embedded.set(key, f);
    }
    return f;
  };

  /** Splits text into runs, each from the first font of the chain that has the glyph; unknown glyphs are reported, not drawn. */
  const segmentize = (chain: Chain, text: string) => {
    const segs: { part: Part; text: string }[] = [];
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (isInvisible(cp)) continue;
      const part = chain.parts.find((p) => p.fk.hasGlyphForCodePoint(cp));
      if (!part) {
        missing.add(ch);
        continue;
      }
      const last = segs[segs.length - 1];
      if (last && last.part === part) last.text += ch;
      else segs.push({ part, text: ch });
    }
    return segs;
  };

  const col = (c: Rgba) => rgb(c.r / 255, c.g / 255, c.b / 255);
  const Hpt = job.heightPx * PT;
  const ascentPx = (chain: Chain, sizePx: number) => Math.round((chain.parts[0]!.fk.ascent * sizePx) / chain.parts[0]!.fk.unitsPerEm);
  const baselineOf = async (line: LineRef) => Math.round(line.top + ascentPx(await chainOf(line.face), line.size));

  for (const [i, sheet] of job.sheets.entries()) {
    const page: PDFPage = doc.addPage([job.widthPx * PT, Hpt]);
    const Y = (px: number) => Hpt - px * PT;

    /** Draws `text` from x (px) on a baseline (px); tc is extra spacing in pt per character. */
    const drawRun = async (chain: Chain, text: string, xPx: number, baselinePx: number, sizePx: number, color: Rgba, tc: number, tnum: boolean) => {
      let x = xPx * PT;
      for (const seg of segmentize(chain, text)) {
        const font = await fontFor(seg.part, tnum);
        const size = sizePx * PT;
        if (tc) page.pushOperators(setCharacterSpacing(tc));
        page.drawText(seg.text, { x, y: Y(baselinePx), size, font, color: col(color) });
        if (tc) page.pushOperators(setCharacterSpacing(0));
        x += font.widthOfTextAtSize(seg.text, size) + tc * [...seg.text].length;
      }
    };

    for (const op of sheet.ops) {
      switch (op.k) {
        case "rect":
          page.drawRectangle({ x: op.x * PT, y: Y(op.y + op.h), width: op.w * PT, height: op.h * PT, color: col(op.c), opacity: op.c.a, borderWidth: 0 });
          break;
        case "text": {
          const chain = await chainOf(op.face);
          const body = op.s.trimEnd();
          const size = op.size * PT;
          // Natural width of the run, then the per-character spacing that makes it exactly as wide as
          // the browser drew it (kerning/rounding differences never accumulate past one word).
          let natural = 0;
          let n = 0;
          for (const seg of segmentize(chain, body)) {
            natural += (await fontFor(seg.part, false)).widthOfTextAtSize(seg.text, size);
            n += [...seg.text].length;
          }
          const tc = n ? Math.max(-1.5, Math.min(1.5, (op.w * PT - natural) / n)) : 0;
          await drawRun(chain, op.s, op.x, Math.round(op.top + ascentPx(chain, op.size)), op.size, op.c, Math.abs(tc) > 0.005 ? tc : 0, false);
          break;
        }
        case "deco": {
          const chain = await chainOf(op.face);
          const fk = chain.parts[0]!.fk;
          const base = Math.round(op.top + ascentPx(chain, op.size));
          const thick = Math.max(1, (fk.underlineThickness * op.size) / fk.unitsPerEm);
          const yTop = op.kind === "underline" ? base - (fk.underlinePosition * op.size) / fk.unitsPerEm - thick / 2 : base - op.size * 0.3;
          page.drawRectangle({ x: op.x * PT, y: Y(yTop + thick), width: op.w * PT, height: thick * PT, color: col(op.c) });
          break;
        }
        case "marker": {
          const baseline = await baselineOf(op.line);
          const chain = await chainOf(op.face);
          const a = ascentPx(chain, op.size);
          if (op.kind === "number") {
            // "1. " ends where the item text starts; ::marker uses tabular figures.
            let w = 0;
            for (const seg of segmentize(chain, op.label)) w += (await fontFor(seg.part, true)).widthOfTextAtSize(seg.text, op.size * PT);
            await drawRun(chain, op.label, op.x - w / PT, baseline, op.size, op.c, 0, true);
            break;
          }
          // Chrome's symbol marker (measured against the real browser at 12, 14, 16, 18, 20 and 24 px,
          // any line height; e2e/pdfExport.mjs re-checks it): with a = the item font's rounded ascent,
          // the bullet is a d x d box, d = floor((floor(2a/3)+1)/2), whose left edge is floor(2a/3)+7 px
          // before the item text and whose top is floor(3(a - floor(2a/3))/2) below the top of the
          // ascent (baseline - a). Painted on whole pixels.
          const lineBaseline = op.line.top + ascentPx(await chainOf(op.line.face), op.line.size);
          const two3 = Math.floor((2 * a) / 3);
          const d = Math.max(1, Math.floor((two3 + 1) / 2));
          const left = Math.round(op.x - (two3 + 7));
          const top = Math.round(lineBaseline - a + Math.floor((3 * (a - two3)) / 2));
          if (op.kind === "square") page.drawRectangle({ x: left * PT, y: Y(top + d), width: d * PT, height: d * PT, color: col(op.c) });
          else
            page.drawEllipse({
              x: (left + d / 2) * PT, y: Y(top + d / 2), xScale: (d / 2) * PT, yScale: (d / 2) * PT,
              color: op.kind === "disc" ? col(op.c) : undefined, borderColor: col(op.c), borderWidth: op.kind === "circle" ? PT : 0,
            });
          break;
        }
        case "check": {
          // Chrome's checkbox: 1px rounded box; checked = filled with the accent color and a white tick.
          const x = op.x * PT, y = Y(op.y + op.h), w = op.w * PT, h = op.h * PT;
          if (op.checked) {
            page.drawRectangle({ x, y, width: w, height: h, color: col(op.accent), borderWidth: 0 });
            const p = (fx: number, fy: number) => ({ x: x + fx * w, y: y + (1 - fy) * h });
            const t = Math.max(1, op.w * 0.12) * PT;
            page.drawLine({ start: p(0.22, 0.52), end: p(0.42, 0.72), thickness: t, color: rgb(1, 1, 1) });
            page.drawLine({ start: p(0.42, 0.72), end: p(0.78, 0.3), thickness: t, color: rgb(1, 1, 1) });
          } else {
            page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), borderColor: rgb(0.463, 0.463, 0.463), borderWidth: PT });
          }
          break;
        }
        case "img": {
          const img = op.mime === "image/jpeg" ? await doc.embedJpg(op.bytes) : await doc.embedPng(op.bytes);
          page.drawImage(img, { x: op.x * PT, y: Y(op.y + op.h), width: op.w * PT, height: op.h * PT });
          break;
        }
        case "link": {
          const ctx = doc.context;
          const ref = ctx.register(
            ctx.obj({
              Type: "Annot", Subtype: "Link", Border: [0, 0, 0],
              Rect: [op.x * PT, Y(op.y + op.h), (op.x + op.w) * PT, Y(op.y)],
              A: { Type: "Action", S: "URI", URI: PDFString.of(op.uri) },
            })
          );
          const existing = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
          if (existing) existing.push(ref);
          else page.node.set(PDFName.of("Annots"), ctx.obj([ref]));
          break;
        }
      }
    }
    progress(i + 1, job.sheets.length);
  }
  return { bytes: await doc.save(), missing: [...missing] };
}

const post = (m: WorkerMessage, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

self.onmessage = async (e: MessageEvent<PdfJob>) => {
  try {
    const { bytes, missing } = await build(e.data, (done, total) => post({ type: "progress", done, total }));
    post({ type: "done", bytes, missing }, [bytes.buffer]);
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
