// Local-only: "How this was counted" in the instructor and student member windows at 375px and at 200% zoom
// (a 1280px desktop zoomed to 200% is a 640px CSS viewport), section closed and open.
// Checks: closed by default, no sideways page scroll, nothing past the dialog edge, no text under 12px,
// buttons at least 36px tall (the section header at least 44px), the outside-work line is shown when open,
// the student version never mentions Gini/bands/index, no console errors. Screenshots go to the given folder.
// No backend. Run: node e2e/howCounted.mjs [screenshot-dir]
// Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5205;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
const saved = [];

async function measure(page, width) {
  return page.evaluate((w) => {
    const dlg = document.querySelector("[role=dialog]");
    const area = [...dlg.querySelectorAll("*")].filter((e) => !e.closest("svg") && !e.classList.contains("sr-only"));
    const tiny = area
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
      .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
    const d = dlg.getBoundingClientRect();
    const past = area.filter((e) => getComputedStyle(e).position !== "absolute" && e.getBoundingClientRect().right > d.right + 1).length;
    const short = area
      .filter((e) => e.matches("button, a[href]") && !(e.getAttribute("aria-label") ?? "").startsWith("About") && !e.closest("p"))
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 35.5; })
      .map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past, short, w };
  }, width);
}

try {
  for (const scene of ["instructor", "student"]) {
    for (const [name, width, height, dsf] of [["375", 375, 800, 1], ["zoom200", 640, 480, 2]]) {
      console.log(`\n== ${scene} @ ${name} (${width}x${height}, device scale ${dsf})`);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/e2e/howCounted.html?scene=${scene}`);
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(400);

      const header = page.getByRole("button", { name: /How this was counted/ });
      await header.scrollIntoViewIfNeeded();
      check((await header.getAttribute("aria-expanded")) === "false", "the section is closed by default");
      const hb = await header.boundingBox();
      check(hb.height >= 43.5, `section header is at least 44px tall (${Math.round(hb.height)}px)`);

      for (const state of ["closed", "open"]) {
        if (state === "open") {
          await header.click();
          await page.waitForTimeout(200);
          check((await header.getAttribute("aria-expanded")) === "true", "clicking opens it");
          const region = page.getByRole("region", { name: "How this was counted" });
          const text = await region.innerText();
          check(text.includes("Work outside GitHub and FairTraze Docs is not counted."), "outside-work line is shown");
          check(text.includes("Scoring rules version 2."), "rules version is shown");
          check(/about [\d,]+ characters/.test(text), "self-deleted Docs count is worded 'about N characters'");
          if (scene === "student") {
            check(!/gini|band|index|share/i.test(text), "student text has no Gini, band, index or share wording");
            check(!text.includes("the member"), "student text speaks to 'you'");
          } else {
            check(text.includes("the member"), "instructor text speaks about 'the member'");
          }
          await region.scrollIntoViewIfNeeded();
          await page.evaluate(() => {
            const r = document.querySelector("[role=dialog] [role=region][aria-label='How this was counted']");
            r?.scrollIntoView({ block: "end" });
          });
          await page.waitForTimeout(150);
        }
        const m = await measure(page, width);
        check(m.sw <= m.cw, `[${state}] no sideways page scroll (${m.sw} <= ${m.cw})`);
        check(m.past === 0, `[${state}] nothing runs past the dialog's right edge (${m.past})`);
        check(m.tiny.length === 0, `[${state}] no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
        check(m.short.length === 0, `[${state}] buttons are at least 36px tall ${m.short.join(" | ")}`);
        if (shots) {
          const file = `howcounted__${scene}__${name}__${state}.png`;
          await page.screenshot({ path: path.join(shots, file) });
          saved.push(file);
        }
      }
      check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);
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
