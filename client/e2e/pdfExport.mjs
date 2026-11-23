// Local-only check of the real PDF export ("Download PDF"). NOT part of `npm test`, not run in CI.
//
//   npm run test:e2e -w client          (runs this, the page parity check and the schema check)
//   node e2e/pdfExport.mjs [--artifacts <dir>] [--only <substring>] [--report <file.json>]
//
// For every case it mounts the document as the ON-SCREEN page view in headless Chromium, builds the
// real PDF through the same code the editor uses (layout copy -> measured ops -> Web Worker ->
// pdf-lib), and compares the PDF (read back with pdfjs-dist) with the screen:
//   * page count == sheet count, first line of each page, paper size (MediaBox) == page setup
//   * extracted text == the document text, in order; nothing on two pages; links are safe
//   * every ink pixel is inside the margins
//   * per page: the share of pixels that still differ after 1 px of tolerance (limit 0.5%)
//   * per word: the ink box of every word in the PDF within 1 px (0.75 pt) of its screen box
//   * list markers (bullets/numbers) within 1 px at 12, 14, 16, 20 and 24 px
// plus: missing-glyph notice, dark-theme app -> still black on white, export is read-only (0 Yjs
// updates), 50-page performance, progress and Cancel. No backend, no database.

import { createServer } from "vite";
import { chromium } from "playwright";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};
const artifacts = arg("--artifacts");
const only = arg("--only");
const reportFile = arg("--report");
if (artifacts) fs.mkdirSync(artifacts, { recursive: true });

const PORT = 5201;
const BASE = `http://localhost:${PORT}`;
const PX = 96 / 72;
const PAGE_DIFF_LIMIT_PCT = 0.5;
const WORD_LIMIT_PX = 1.0;

const HF = {
  header: { left: "Group 4 header", center: "Centre header", right: "Page {page}" },
  footer: { left: "Footer left", center: "Page {page}", right: "Footer right" },
};
const NORMAL = "NORMAL";
const cases = [];
const add = (c) => cases.push({ margins: NORMAL, ...c });
// Every paper x orientation, with breaks and a header/footer.
for (const size of ["LETTER", "LEGAL", "A4"]) {
  for (const orientation of ["PORTRAIT", "LANDSCAPE"]) add({ name: `plain ${size} ${orientation} hf`, doc: "plain", size, orientation, ...HF });
}
// Custom margins (1 / 1 / 0.5 / 1) on every paper, both orientations, plus the other presets.
for (const size of ["LETTER", "LEGAL", "A4"]) {
  for (const orientation of ["PORTRAIT", "LANDSCAPE"]) {
    add({ name: `plain ${size} ${orientation} custom 1/1/0.5/1`, doc: "plain", size, orientation, margins: "CUSTOM", custom: { top: 1, bottom: 1, left: 0.5, right: 1 } });
  }
}
add({ name: "plain A4 LANDSCAPE normal no hf", doc: "plain", size: "A4", orientation: "LANDSCAPE" });
add({ name: "plain LETTER PORTRAIT narrow", doc: "plain", size: "LETTER", orientation: "PORTRAIT", margins: "NARROW" });
add({ name: "plain A4 LANDSCAPE wide", doc: "plain", size: "A4", orientation: "LANDSCAPE", margins: "WIDE" });
add({ name: "plain LETTER PORTRAIT custom 0/0/0/0", doc: "plain", size: "LETTER", orientation: "PORTRAIT", margins: "CUSTOM", custom: { top: 0, bottom: 0, left: 0, right: 0 } });
add({ name: "plain LETTER PORTRAIT custom 3/3/3/3", doc: "plain", size: "LETTER", orientation: "PORTRAIT", margins: "CUSTOM", custom: { top: 3, bottom: 3, left: 3, right: 3 } });
// The every-feature document.
for (const size of ["LETTER", "LEGAL", "A4"]) {
  for (const orientation of ["PORTRAIT", "LANDSCAPE"]) {
    add({ name: `every ${size} ${orientation} custom 1/1/0.5/1 hf`, doc: "every", size, orientation, margins: "CUSTOM", custom: { top: 1, bottom: 1, left: 0.5, right: 1 }, ...HF });
  }
}
add({ name: "every LETTER PORTRAIT", doc: "every", size: "LETTER", orientation: "PORTRAIT" });
add({ name: "url wraps LETTER PORTRAIT", doc: "url", size: "LETTER", orientation: "PORTRAIT" });
add({ name: "url wraps A4 LANDSCAPE narrow", doc: "url", size: "A4", orientation: "LANDSCAPE", margins: "NARROW" });
add({ name: "list markers 12/14/16/20/24px", doc: "markers", size: "LETTER", orientation: "PORTRAIT" });
add({ name: "missing glyphs notice", doc: "missing", size: "LETTER", orientation: "PORTRAIT" });
add({ name: "dark app theme -> light PDF", doc: "every", size: "LETTER", orientation: "PORTRAIT", dark: true, ...HF });

const failures = [];
const report = [];
const fail = (c, msg) => failures.push(`${c.name}: ${msg}`);

// ── pdf reading helpers ──────────────────────────────────────────────────────────────────────
async function readPdf(bytes) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    // Items are joined as they were drawn (a subscript "2" in "H2O" is its own item) and cut into words at whitespace.
    const tokens = tc.items.map((it) => it.str + (it.hasEOL ? "\n" : "")).join("").split(/\s+/).filter(Boolean);
    const annots = (await pg.getAnnotations()).filter((a) => a.subtype === "Link");
    const vp = pg.getViewport({ scale: PX });
    const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    pages.push({ view: pg.view, tokens, annots, canvas, ctx });
  }
  const meta = await doc.getMetadata();
  return { pages, title: meta.info?.Title };
}

const gray = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Ink bounding box (pixels darker than the threshold) inside a rectangle, or null. */
function inkBox(d, W, H, x0, y0, x1, y1, thr = 190) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      if (gray(d, (y * W + x) * 4) < thr) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { l: minX, r: maxX + 1, t: minY, b: maxY + 1 };
}

/** Darkness-weighted centre and total of the ink in a rectangle (independent of any threshold). */
function inkCentroid(d, W, H, x0, y0, x1, y1) {
  let sx = 0, sy = 0, sum = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
      const v = 255 - gray(d, (y * W + x) * 4);
      if (v > 6) { sx += (x + 0.5) * v; sy += (y + 0.5) * v; sum += v; }
    }
  }
  return sum ? { cx: sx / sum, cy: sy / sum, ink: sum } : null;
}
const markerFit = {}; // per size: how far the PDF's bullet centre is from the screen's (for tuning and the report)

/** Share of the page's pixels that differ by >48 and have no similar pixel within 1 px in the other image. */
function pageDiff(a, b, W, H) {
  const close = (x, y, ga, d) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (Math.abs(gray(d, (yy * W + xx) * 4) - ga) < 48) return true;
    }
    return false;
  };
  let sum = 0, strict = 0, tolerant = 0, ink = 0;
  const out = createCanvas(W, H);
  const og = out.getContext("2d");
  const img = og.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const ga = gray(a, i), gb = gray(b, i);
    const dlt = Math.abs(ga - gb);
    sum += dlt;
    if (ga < 200 || gb < 200) ink++;
    let bad = false;
    if (dlt > 48) {
      strict++;
      bad = !(close(x, y, ga, b) && close(x, y, gb, a));
      if (bad) tolerant++;
    }
    const base = 255 - Math.round((255 - ga) * 0.25);
    img.data[i] = bad ? 255 : base;
    img.data[i + 1] = bad ? 0 : base;
    img.data[i + 2] = bad ? 0 : base;
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const px = W * H;
  return { meanAbs: sum / px, strictPct: (strict / px) * 100, tolerantPct: (tolerant / px) * 100, tolerantOfInkPct: ink ? (tolerant / ink) * 100 : 0, canvas: out };
}

async function decode(buf) {
  const img = await loadImage(buf);
  const c = createCanvas(img.width, img.height);
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  return { data: g.getImageData(0, 0, img.width, img.height).data, W: img.width, H: img.height };
}

const label = (c) => c.name;
const tokens = (s) => s.split(/\s+/).filter(Boolean);

// ── run ──────────────────────────────────────────────────────────────────────────────────────
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ args: ["--enable-precise-memory-info", "--disable-lcd-text"] });
const rows = [];
try {
  const light = await browser.newContext({ viewport: { width: 1500, height: 1300 }, colorScheme: "light" });
  const dark = await browser.newContext({ viewport: { width: 1500, height: 1300 }, colorScheme: "dark" });
  const open = async (ctx) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
    await page.goto(`${BASE}/e2e/pdf-harness.html`);
    await page.waitForFunction(() => window.__pdf);
    return page;
  };
  const lightPage = await open(light);
  const darkPage = await open(dark);
  // Vite re-optimises a dependency the first time it is imported and reloads the page; that can
  // happen at any case that touches new code, so every evaluate() survives a reload.
  async function evaluateRetrying(pg, fn, arg) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await pg.evaluate(fn, arg);
      } catch (e) {
        if (attempt >= 5 || !/context was destroyed|navigation|Target closed/i.test(String(e))) throw e;
        await pg.waitForLoadState("load").catch(() => undefined);
        await pg.waitForFunction(() => window.__pdf).catch(() => undefined);
      }
    }
  }
  // Warm-up (not counted): touches every code path once so no reload happens mid-measurement.
  for (const doc of ["every", "markers", "url", "long"]) {
    if (doc === "long") continue;
    await evaluateRetrying(lightPage, (cc) => window.__pdf.run(cc), { name: "warm-up", doc, size: "LETTER", orientation: "PORTRAIT", margins: "NORMAL" });
  }
  await evaluateRetrying(darkPage, (cc) => window.__pdf.run(cc), { name: "warm-up", doc: "plain", size: "LETTER", orientation: "PORTRAIT", margins: "NORMAL", dark: true });

  console.log("case".padEnd(52), "sheets pdf  worst page diff   worst word  worst marker  result");
  for (const c of cases) {
    if (only && !c.name.includes(only)) continue;
    const before = failures.length;
    const pg = c.dark ? darkPage : lightPage;
    const r = await evaluateRetrying(pg, (cc) => window.__pdf.run(cc), c);
    const bytes = Buffer.from(r.pdf.base64, "base64");
    const pdf = await readPdf(bytes);
    const g = r.geometry;
    const W = g.widthPx, H = g.heightPx;

    // 1. sheets, size, title
    if (pdf.pages.length !== r.screen.pages) fail(c, `PDF has ${pdf.pages.length} pages, the page view shows ${r.screen.pages} sheets`);
    if (r.pdf.pages !== r.screen.pages) fail(c, `exporter reports ${r.pdf.pages} pages, page view ${r.screen.pages}`);
    for (const [i, p] of pdf.pages.entries()) {
      if (Math.abs(p.view[2] - W * 0.75) > 0.02 || Math.abs(p.view[3] - H * 0.75) > 0.02) fail(c, `page ${i + 1} MediaBox ${p.view[2]}x${p.view[3]}pt, expected ${W * 0.75}x${H * 0.75}`);
    }
    if (pdf.title !== "Harness document") fail(c, `PDF title is "${pdf.title}"`);

    // 2. text: in order, nothing duplicated, first line of each page
    const hfWords = new Set([...tokens(Object.values(HF.header).join(" ")), ...tokens(Object.values(HF.footer).join(" "))].map((w) => w.replace("{page}", "")).filter(Boolean));
    const allowed = (w) => (c.header ? hfWords.has(w) : false) || /^\d+$/.test(w) || /^\d+\.$/.test(w);
    // The document's words, in order, must be exactly what the PDF contains once the known extras
    // (header/footer text, page numbers, list numbers) are taken out. Compared without whitespace so a
    // long URL that wraps (cut into several lines) still equals the one word it is.
    const pdfText = pdf.pages.flatMap((p) => p.tokens).filter((w) => !allowed(w)).join("");
    const wantText = r.screen.docWords.join("");
    if (!r.pdf.missing.length && pdfText !== wantText) {
      let i = 0;
      while (i < pdfText.length && pdfText[i] === wantText[i]) i++;
      fail(c, `extracted text differs from the document text at character ${i}: PDF "${pdfText.slice(Math.max(0, i - 15), i + 25)}" vs document "${wantText.slice(Math.max(0, i - 15), i + 25)}"`);
    }
    const seen = new Map();
    pdf.pages.forEach((p, i) => p.tokens.forEach((w) => { if (/^[A-Z]\d+:$/.test(w)) { if (seen.has(w) && seen.get(w) !== i) fail(c, `"${w}" appears on page ${seen.get(w) + 1} and page ${i + 1}`); seen.set(w, i); } }));
    // First line of each page: the first body word in reading order on that sheet of the PAGE VIEW
    // (read with the same collector) must be the first body word in the PDF.
    for (const [i, p] of pdf.pages.entries()) {
      const screenOps = (r.screen.ops[i] ?? []).filter((o) => o.k === "text").map((o) => o.s.trim()).filter(Boolean);
      // (a list number such as "1." precedes its item in reading order, so it is not "the first word" either)
      const isHf = (w) => (c.header && (hfWords.has(w) || /^\d+$/.test(w))) || /^\d+\.$/.test(w);
      const wantFirst = screenOps.find((w) => !isHf(w));
      const first = p.tokens.find((w) => !isHf(w));
      if ((wantFirst ?? null) !== (first ?? null)) fail(c, `first line of page ${i + 1}: PDF "${first}" vs page view "${wantFirst}"`);
    }

    // 3. links: only http/https/mailto
    for (const [i, p] of pdf.pages.entries()) for (const a of p.annots) {
      if (!/^(https?:|mailto:)/i.test(a.url ?? "")) fail(c, `page ${i + 1} has a link annotation to "${a.url}"`);
    }
    if (c.doc === "every") {
      const urls = pdf.pages.flatMap((p) => p.annots.map((a) => a.url));
      for (const u of ["https://example.com/docs/page?id=42", "mailto:team@example.com", "https://example.com/long"]) if (!urls.includes(u)) fail(c, `missing link annotation ${u}`);
    }
    if (c.doc === "url") {
      const urls = pdf.pages.flatMap((p) => p.annots);
      if (urls.length < 3) fail(c, `a wrapped URL should have one link rectangle per line (found ${urls.length})`);
    }

    // 4. pixels: margins, per-page diff, words, markers
    let worstDiff = 0, worstWord = 0, worstMarker = 0;
    if (c.doc === "missing") {
      if (!r.pdf.missing.includes("\u{1F600}") || !r.pdf.missing.includes("漢")) fail(c, `missing-glyph list is ${JSON.stringify(r.pdf.missing)}`);
      if (r.pdf.missing.some((m) => "₱ñÑ".includes(m))) fail(c, `peso/ñ reported as missing: ${JSON.stringify(r.pdf.missing)}`);
    }
    for (const [i, p] of pdf.pages.entries()) {
      const pw = p.canvas.width, ph = p.canvas.height;
      const pd = p.ctx.getImageData(0, 0, pw, ph).data;
      // margins: all ink inside the content rectangle (1 px slack)
      const box = inkBox(pd, pw, ph, 0, 0, pw, ph, 235);
      const m = g.margins;
      if (box && !c.dark) {
        // header/footer text is part of the content area (documented), so the same rectangle applies
        if (box.l < m.left - 1 || box.r > W - m.right + 1 || box.t < m.top - 1 || box.b > H - m.bottom + 1) {
          fail(c, `page ${i + 1} ink ${box.l},${box.t}-${box.r},${box.b} is outside the margins (${m.left},${m.top})-(${W - m.right},${H - m.bottom})`);
        }
      }
      if (c.dark) {
        const corner = gray(pd, 0);
        let darkest = 255;
        for (let k = 0; k < pd.length; k += 4) darkest = Math.min(darkest, gray(pd, k));
        if (corner < 250) fail(c, `dark theme: page background is ${Math.round(corner)}, expected white`);
        if (darkest > 110) fail(c, `dark theme: darkest text pixel is ${Math.round(darkest)}: text is not dark on white`);
        continue;
      }
      // screenshot of the same sheet on screen
      const rect = r.screen.sheetRects[i];
      if (!rect) continue;
      const shot = await pg.screenshot({ fullPage: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } });
      const s = await decode(shot);
      if (s.W !== pw || s.H !== ph) { fail(c, `page ${i + 1}: screenshot ${s.W}x${s.H} vs PDF raster ${pw}x${ph}`); continue; }
      const d = pageDiff(s.data, pd, pw, ph);
      worstDiff = Math.max(worstDiff, d.tolerantPct);
      if (d.tolerantPct > PAGE_DIFF_LIMIT_PCT) fail(c, `page ${i + 1}: ${d.tolerantPct.toFixed(3)}% of pixels differ after 1 px tolerance (limit ${PAGE_DIFF_LIMIT_PCT}%)`);
      rows.push({ case: c.name, page: i + 1, meanAbs: +d.meanAbs.toFixed(3), strictPct: +d.strictPct.toFixed(3), tolerantPct: +d.tolerantPct.toFixed(3), tolerantOfInkPct: +d.tolerantOfInkPct.toFixed(1) });
      if (artifacts && (failures.length > before || process.argv.includes("--all-artifacts") || c.name.includes("every LETTER PORTRAIT") || c.name.startsWith("list markers"))) {
        const tag = `${c.name.replace(/[^a-z0-9]+/gi, "_")}_p${i + 1}`;
        fs.writeFileSync(path.join(artifacts, `${tag}_screen.png`), shot);
        fs.writeFileSync(path.join(artifacts, `${tag}_pdf.png`), p.canvas.toBuffer("image/png"));
        fs.writeFileSync(path.join(artifacts, `${tag}_diff.png`), d.canvas.toBuffer("image/png"));
      }

      // words: the ink box of every word within 1 px of the screen's
      const stats = { n: 0, worst: 0 };
      for (const op of r.screen.ops[i] ?? []) {
        let x0, x1, y0, y1;
        if (op.k === "text") {
          // characters no bundled font has are left out of the PDF by design (reported to the user)
          if (c.doc === "missing" && /[\u{1F600}漢字]/u.test(op.s)) continue;
          // Underline/strike lines are separate shapes that end a pixel or two from the glyph edge; a word
          // whose ink box touches one is covered by the page diff instead.
          if ((r.screen.ops[i] ?? []).some((o) => o.k === "deco" && Math.abs(o.top - op.top) < 2 && o.x < op.x + op.w + 8 && o.x + o.w > op.x - 8)) continue;
          x0 = op.x - 1; x1 = op.x + op.w + 1; y0 = op.top; y1 = op.top + Math.round(op.size * 1.15);
        } else if (op.k === "marker") {
          x0 = op.x - 44; x1 = op.x - 1; y0 = op.line.top - 2; y1 = op.line.top + Math.round(op.line.size * 1.3);
        } else continue;
        if (op.k === "marker" && op.kind !== "number") {
          // Bullets: compare the centre of the ink (threshold-free): within 1 px, and the same size.
          const ca = inkCentroid(s.data, pw, ph, x0, y0, x1, y1);
          const cb = inkCentroid(pd, pw, ph, x0, y0, x1, y1);
          if (!ca || !cb) { fail(c, `page ${i + 1}: a ${op.kind} marker is missing in the ${ca ? "PDF" : "page view"} at x=${Math.round(op.x)}`); continue; }
          const dx = cb.cx - ca.cx, dy = cb.cy - ca.cy;
          const m = (markerFit[op.size] ??= { n: 0, dx: 0, dy: 0, worst: 0, ratio: 0 });
          m.n++; m.dx += dx; m.dy += dy; m.worst = Math.max(m.worst, Math.abs(dx), Math.abs(dy)); m.ratio += cb.ink / ca.ink;
          worstMarker = Math.max(worstMarker, Math.round(Math.max(Math.abs(dx), Math.abs(dy)) * 10) / 10);
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || cb.ink / ca.ink < 0.75 || cb.ink / ca.ink > 1.33) {
            fail(c, `page ${i + 1}: ${op.kind} marker (${op.size}px) centre is off by ${dx.toFixed(2)},${dy.toFixed(2)} px, ink ${(cb.ink / ca.ink).toFixed(2)}x the page view's`);
          }
          continue;
        }
        const a = inkBox(s.data, pw, ph, x0, y0, x1, y1);
        const b = inkBox(pd, pw, ph, x0, y0, x1, y1);
        if (!a && !b) continue;
        stats.n++;
        const dev = !a || !b ? 99 : Math.max(Math.abs(a.l - b.l), Math.abs(a.r - b.r), Math.abs(a.t - b.t), Math.abs(a.b - b.b));
        if (op.k === "marker") worstMarker = Math.max(worstMarker, dev); else worstWord = Math.max(worstWord, dev);
        stats.worst = Math.max(stats.worst, dev);
        const limit = WORD_LIMIT_PX;
        if (dev > limit) {
          fail(c, `page ${i + 1}: ${op.k === "marker" ? `${op.kind} marker` : `word "${op.s?.trim()}"`} ink box is ${dev}px off the screen's (limit ${limit}px) at x=${Math.round(op.x)},y=${Math.round(op.top ?? op.line.top)}${op.k === "marker" ? ` [${op.size}px: screen ${JSON.stringify(a)} pdf ${JSON.stringify(b)}]` : ""}`);
          if (failures.length - before > 25) break;
        }
      }
    }
    // 5. progress is reported and ends at 100%
    if (r.pdf.progress.length < 3 || r.pdf.progress[r.pdf.progress.length - 1] < 0.999) fail(c, `progress ${JSON.stringify(r.pdf.progress.slice(-3))}`);

    const ok = failures.length === before;
    console.log(label(c).padEnd(52), String(r.screen.pages).padStart(5), String(pdf.pages.length).padStart(4), `${worstDiff.toFixed(3).padStart(10)}%`, `${String(worstWord).padStart(8)}px`, `${String(worstMarker).padStart(10)}px`, ok ? "  ok" : "  FAIL");
    report.push({ case: c.name, sheets: r.screen.pages, pdfPages: pdf.pages.length, worstPageDiffPct: +worstDiff.toFixed(3), worstWordPx: worstWord, worstMarkerPx: worstMarker, bytes: r.pdf.bytes, timings: r.pdf.timings, missing: r.pdf.missing });
  }

  if (!only || "read-only".includes(only)) {
    const ro = await evaluateRetrying(lightPage, () => window.__pdf.readOnly());
    const c = { name: "export is read-only" };
    if (ro.yjsUpdates !== 0) fail(c, `${ro.yjsUpdates} Yjs update(s) during export`);
    if (!ro.stateUnchanged || !ro.contentUnchanged) fail(c, `shared document changed: ${JSON.stringify(ro)}`);
    console.log("export is read-only (Yjs updates during export):".padEnd(52), ro.yjsUpdates, ro.stateUnchanged && ro.contentUnchanged ? "  ok" : "  FAIL");
  }

  if (!only || "50-page".includes(only)) {
    const requests = [];
    lightPage.on("request", (rq) => requests.push(rq.url()));
    const perf = await evaluateRetrying(lightPage, () => window.__pdf.perf());
    const c = { name: "50-page document" };
    const offsite = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith("blob:") && !u.startsWith("data:"));
    if (offsite.length) fail(c, `network requests outside the app during export: ${offsite.slice(0, 3).join(", ")}`);
    const nonAsset = requests.filter((u) => u.startsWith(BASE) && !/\.(woff2?|ts|js|css|mjs|map)(\?|$)|\/@vite|\/node_modules\/|\/src\/|\/@fs\//.test(u));
    if (nonAsset.length) fail(c, `unexpected app requests during export: ${nonAsset.slice(0, 3).join(", ")}`);
    if (perf.pages < 45 || perf.pages > 55) fail(c, `expected about 50 pages, got ${perf.pages}`);
    if (!perf.progressMonotonic || perf.progressEnds < 0.999 || perf.progressEvents < 20) fail(c, `progress: ${perf.progressEvents} events, monotonic=${perf.progressMonotonic}, ends=${perf.progressEnds}`);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(perf.base64, "base64")) }).promise;
    if (doc.numPages !== perf.pages) fail(c, `50-page PDF has ${doc.numPages} pages, exporter said ${perf.pages}`);
    if (perf.longestStallMs > 250) fail(c, `main thread stalled for ${perf.longestStallMs} ms (limit 250 ms): the page would feel frozen`);
    const { base64, ...summary } = perf;
    console.log("50-page document:", JSON.stringify(summary));
    report.push({ case: "50-page document", ...summary });

    for (const f of [0.1, 0.45, 0.8]) {
      const cr = await evaluateRetrying(lightPage, (x) => window.__pdf.cancel(x), f);
      if (cr.rejectedWith !== "AbortError") fail(c, `cancel at ${f * 100}%: rejected with "${cr.rejectedWith}"`);
      if (cr.msFromAbortToReject > 1000) fail(c, `cancel at ${f * 100}%: took ${cr.msFromAbortToReject} ms to stop`);
      if (cr.iframesLeft !== 0) fail(c, `cancel at ${f * 100}%: ${cr.iframesLeft} offscreen frame(s) left behind`);
      console.log(`cancel at ${Math.round(f * 100)}%:`, JSON.stringify(cr));
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (rows.length) {
  console.log("\nper-page pixel diff (after 1 px tolerance; limit " + PAGE_DIFF_LIMIT_PCT + "% of the page):");
  const worst = [...rows].sort((a, b) => b.tolerantPct - a.tolerantPct).slice(0, 8);
  for (const w of worst) console.log(`  ${w.case} p${w.page}: ${w.tolerantPct}% of page (${w.tolerantOfInkPct}% of ink), strict ${w.strictPct}%, mean abs ${w.meanAbs}/255`);
}
if (Object.keys(markerFit).length) {
  console.log("\nbullet geometry vs the page view (PDF centre minus screen centre, px; mean over bullets):");
  for (const [size, m] of Object.entries(markerFit).sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(size).padStart(2)}px  n=${String(m.n).padStart(2)}  dx ${(m.dx / m.n).toFixed(2).padStart(6)}  dy ${(m.dy / m.n).toFixed(2).padStart(6)}  worst ${m.worst.toFixed(2)}  ink ${(m.ratio / m.n).toFixed(2)}x`);
  }
}
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ pages: rows, cases: report }, null, 2));

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures.slice(0, 60)) console.error(" - " + f);
  process.exit(1);
}
console.log(`\nAll ${cases.length} PDF cases match the page view.`);
