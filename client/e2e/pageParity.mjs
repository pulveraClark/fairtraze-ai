// Local-only page-layout parity check. NOT part of `npm test` and not run in CI.
//
//   npm run test:e2e -w client            (from the repo root)
//   npm run test:e2e                      (from client/)
//
// It starts a throwaway Vite dev server on port 5199, opens e2e/harness.html in headless Chromium
// (the Playwright build already installed for this repo), and for every paper size x orientation
// (and the margin presets) renders the same document twice: as the on-screen page view and through
// the PDF print path. It then asserts the page count and the first line of every sheet are identical,
// that each forced page break starts a new sheet, and that header/footer text is centred and does not
// collide. Finally the print copy is rendered to a real PDF by Chromium and its page count compared.
// No backend, no database, no network beyond localhost.
//
// Options: --screenshots <dir>  also writes PNGs of the on-screen view for a few cases.

import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const shotsIdx = process.argv.indexOf("--screenshots");
const shotsDir = shotsIdx > -1 ? process.argv[shotsIdx + 1] : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

const SIZES = ["SHORT", "LONG", "A4"];
const ORIENTATIONS = ["PORTRAIT", "LANDSCAPE"];

const cases = [];
for (const size of SIZES) {
  for (const orientation of ORIENTATIONS) {
    for (const doc of ["plain", "breaks"]) cases.push({ size, orientation, margins: "NORMAL", doc });
  }
}
for (const margins of ["NARROW", "WIDE"]) {
  for (const orientation of ORIENTATIONS) cases.push({ size: "SHORT", orientation, margins, doc: "breaks" });
}
// The page view is CSS-scaled to fit narrow screens: breaks must still land on the same sheets.
cases.push({ size: "SHORT", orientation: "PORTRAIT", margins: "NORMAL", doc: "breaks", scale: 0.8 });
cases.push({ size: "A4", orientation: "LANDSCAPE", margins: "WIDE", doc: "breaks", scale: 0.6 });
const HF = {
  header: { left: "Left <b>&</b> header", center: "Centre header", right: "Page {page}" },
  footer: { left: "Footer left", center: "Page {page}", right: "Footer right" },
};
for (const size of SIZES) {
  for (const orientation of ORIENTATIONS) cases.push({ size, orientation, margins: "NORMAL", doc: "breaks", ...HF });
}

const failures = [];
const fail = (c, msg) => failures.push(`${label(c)}: ${msg}`);
function label(c) {
  return `${c.size}/${c.orientation}/${c.margins}/${c.doc}${c.header ? "/hf" : ""}${c.scale ? `/x${c.scale}` : ""}`;
}
const pdfPages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  await page.goto(`${BASE}/e2e/harness.html`);
  await page.waitForFunction(() => window.__harness);

  console.log("case".padEnd(34), "screen", "print", "pdf", " result");
  for (const c of cases) {
    const r = await page.evaluate((cc) => window.__harness.run(cc), c);

    // Real PDF from the print copy (Chromium's own print engine, CSS page size).
    const pdfPage = await browser.newPage();
    await pdfPage.setContent(r.printHtml.replace("<head>", `<head><base href="${BASE}/">`), { waitUntil: "load" });
    await pdfPage.evaluate(() => document.fonts.ready);
    r.printCenters = await pdfPage.evaluate(() =>
      Array.from(document.querySelectorAll(".print-sheet")).map((sheet) => {
        const box = sheet.getBoundingClientRect();
        return Array.from(sheet.querySelectorAll(".ft-hf-center")).filter((el) => {
          const q = el.getBoundingClientRect();
          return q.width > 0 && q.top >= box.top - 1 && q.bottom <= box.bottom + 1;
        }).length;
      })
    );
    const pdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
    await pdfPage.close();
    const pdfCount = pdfPages(pdf);

    const before = failures.length;
    if (r.screen.pages !== r.print.pages) fail(c, `page count screen ${r.screen.pages} vs print ${r.print.pages}`);
    if (JSON.stringify(r.screen.firstLines) !== JSON.stringify(r.print.firstLines)) {
      fail(c, `first lines differ\n   screen ${JSON.stringify(r.screen.firstLines)}\n   print  ${JSON.stringify(r.print.firstLines)}`);
    }
    if (pdfCount !== r.print.pages) fail(c, `PDF has ${pdfCount} pages, print copy ${r.print.pages}`);
    if (c.doc === "breaks") {
      // Text right after a forced break must open a sheet (P5 after the 1st break, P12 after the
      // two in a row - which also leaves one blank sheet - and P21 after the last).
      for (const marker of ["P5:", "P12:", "P21:"]) {
        for (const [name, lines] of [["screen", r.screen.firstLines], ["print", r.print.firstLines]]) {
          if (!lines.some((l) => l && l.startsWith(marker))) fail(c, `${name}: "${marker}" does not start a sheet`);
        }
      }
      if (r.screen.breakHeights.length !== 4) fail(c, `expected 4 page-break blocks, found ${r.screen.breakHeights.length}`);
      const i12 = r.print.firstLines.findIndex((l) => l && l.startsWith("P12:"));
      if (i12 < 2 || r.print.firstLines[i12 - 1]) fail(c, `two breaks in a row should leave one blank sheet before P12`);
    } else if (r.screen.breakHeights.length !== 0) {
      fail(c, "plain document should have no page-break blocks");
    }
    if (c.header) {
      for (const cc of r.screen.centers) {
        if (Math.abs(cc.offset) > 2) fail(c, `centre text is ${cc.offset}px off the page centre (${cc.kind})`);
        if (cc.overlapsNeighbour) fail(c, `centre text overlaps left/right text (${cc.kind})`);
      }
      if (r.screen.centers.length === 0) fail(c, "no centred header/footer text rendered");
      // Header and footer text must be on EVERY sheet: one centred header + one centred footer each.
      if (r.screen.centers.length !== 2 * r.screen.pages) {
        fail(c, `screen: ${r.screen.centers.length} centred header/footer texts for ${r.screen.pages} sheets (expected ${2 * r.screen.pages})`);
      }
      for (const [i, n] of r.printCenters.entries()) if (n !== 2) fail(c, `print sheet ${i + 1} shows ${n} centred header/footer texts (expected 2)`);
    }
    console.log(
      label(c).padEnd(34),
      String(r.screen.pages).padStart(6),
      String(r.print.pages).padStart(5),
      String(pdfCount).padStart(3),
      failures.length === before ? " ok" : " FAIL"
    );
    if (shotsDir && (c.doc === "breaks") && (c.header || c.margins !== "NORMAL" || c.size === "SHORT")) {
      await page.evaluate((cc) => window.__harness.show(cc), c);
      await page.screenshot({ path: path.join(shotsDir, `${label(c).replaceAll("/", "_")}.png`), fullPage: true });
    }
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log(`\nAll ${cases.length} layouts match between the page view, the print copy and the PDF.`);
