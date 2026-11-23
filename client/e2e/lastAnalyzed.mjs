// Local-only: the "Last analyzed 3 hours ago" line on the instructor group card, the student project card and the
// student class card, at 375px and at 200% zoom (a 1280px desktop zoomed to 200% is a 640px CSS viewport).
// Checks: no sideways page scroll, nothing past the right edge, no text under 12px, the exact words on screen, a
// tooltip with the exact date and time, no bare locale date left, and no Gini / band / index on a student card.
// No backend. Run: node e2e/lastAnalyzed.mjs [screenshot-dir]. Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5209;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
const saved = [];

try {
  for (const scene of ["instructor-card", "student-class", "student-dashboard"]) {
    for (const [name, width, height, dsf] of [["375", 375, 800, 1], ["zoom200", 640, 480, 2]]) {
      console.log(`\n== ${scene} @ ${name}`);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|cannot contain a nested/.test(m.text())) errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/e2e/lastAnalyzed.html?scene=${scene}`);
      await page.waitForTimeout(700);

      const m = await page.evaluate(() => {
        const root = document.querySelector("main");
        const area = [...root.querySelectorAll("*")].filter((e) => !e.closest("svg") && !e.classList.contains("sr-only"));
        const tiny = area
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const past = area.filter((e) => getComputedStyle(e).position !== "absolute" && e.getBoundingClientRect().right > window.innerWidth + 1).length;
        const line = [...root.querySelectorAll("[title]")].find((e) => /^Last analyzed/.test(e.textContent ?? ""));
        return {
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past,
          text: root.innerText.replace(/\s+/g, " "), title: line?.getAttribute("title") ?? "",
        };
      });
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.past === 0, `nothing runs past the right edge (${m.past})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      check(m.text.includes("Last analyzed 3 hours ago"), "shows: Last analyzed 3 hours ago");
      check(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M$/.test(m.title), `tooltip has the exact date and time (${m.title})`);
      check(!/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(m.text), "no bare locale date left on the card");
      check(!/Analyzed \d/.test(m.text), "no old 'Analyzed <date>' wording");
      if (scene !== "instructor-card") check(!/gini|band|index/i.test(m.text), "no Gini, band or index on a student card");
      check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);
      if (shots) {
        const file = `lastanalyzed__${scene}__${name}.png`;
        await page.screenshot({ path: path.join(shots, file), fullPage: true });
        saved.push(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (saved.length) console.log(`\nScreenshots:\n${saved.map((f) => `  ${f}`).join("\n")}`);
console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
