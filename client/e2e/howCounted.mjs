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
          check(text.includes("Scoring rules v2."), "rules version is shown as \"v2\"");
          check(/about [\d,]+ characters/.test(text), "self-deleted Docs count is worded 'about N characters'");
          check(!/here|harness|undefined|NaN/i.test(text), "no 'here' and no harness notes in the text");
          check(text.includes("Images are shown but not scored") && !/never scored/.test(text), "image sentence is the plain one");
          check(/Counts fully/.test(text) && /Counts less/.test(text) && /Does not count/.test(text) && !/Counted|Not counted/.test(text), "labels are Counts fully / Counts less / Does not count");
          check(text.includes("Auto-generated files (for example lock files)") && !/raw line totals|build output/.test(text), "plain words for generated files");
          check(text.includes("Lines are counted from each member's 100 most recent commits. Commits and active days use the full history."), "GitHub sample note is shown");
          check(/25%/.test(text) && /up to 50%/.test(text) && /30%/.test(text) && /10%/.test(text), "percentages shown as 25%, 30%, 10%, up to 50%");
          const f = await region.evaluate((r) => {
            const px = (e) => parseFloat(getComputedStyle(e).fontSize);
            const q = (sel) => [...r.querySelectorAll(sel)];
            const sections = q("section");
            const chips = q("h5");
            const rows = chips.map((c) => c.parentElement);
            const gaps = sections.slice(0, -1).map((sec, i) => Math.round(sections[i + 1].getBoundingClientRect().top - sec.getBoundingClientRect().bottom));
            return {
              headings: q("h4").length, lists: q("ul").length, chips: chips.length,
              items: q("li").map(px), chipSizes: chips.map(px), headingSizes: q("h4").map(px),
              footer: q("div.space-y-1 > p").map(px),
              notes: q("section > p").map(px),
              chipBold: chips.every((c) => parseInt(getComputedStyle(c).fontWeight, 10) >= 700),
              chipSymbols: chips.every((c) => /^[✓↓✕]/.test(c.textContent.trim())),
              borders: rows.map((e) => getComputedStyle(e).borderLeftWidth),
              chipWidths: chips.map((c) => Math.round(c.getBoundingClientRect().width)),
              chipAbove: chips.every((c) => c.getBoundingClientRect().bottom <= c.parentElement.querySelector("ul").getBoundingClientRect().top + 1),
              gaps,
              order: sections.map((sec) => [...sec.querySelectorAll("h5")].map((h) => h.textContent.trim().replace(/^Ss*/, "")).join(">")),
            };
          });
          console.log("   computed:", JSON.stringify({ items: [...new Set(f.items)], chips: [...new Set(f.chipSizes)], headings: [...new Set(f.headingSizes)], footer: [...new Set(f.footer)], notes: [...new Set(f.notes)], chipWidths: [...new Set(f.chipWidths)], borders: [...new Set(f.borders)], gaps: f.gaps, chipAbove: f.chipAbove }));
          check(f.headings >= 1 && f.lists === f.chips && f.chips >= 3, "real headings and lists (h4 per source, h5 chip, ul per group)");
          check(f.order.every((o) => o.replace(/[✓↓✕]/g, "") === "Counts fully>Counts less>Does not count"), "same order in every source " + f.order.join(" | "));
          check(f.chipBold && f.chipSymbols, "chips are bold and start with a symbol");
          check(f.borders.every((b) => b === "3px"), "left border is 3px");
          check(Math.min(...f.items, ...f.chipSizes, ...f.headingSizes, ...f.footer) >= 14, "computed font size of body, chips, headings and footer is at least 14px");
          check(f.notes.every((n) => n >= 13), "notes line is at least 13px");
          if (width >= 640) check(f.chipWidths.every((w) => w === 150) && !f.chipAbove, "chip is 150px wide, beside its text");
          else check(f.chipAbove, "chip stacks above its text at 375px");
          if (f.gaps.length) check(f.gaps.every((g) => g === 24), "24px between the GitHub and Docs sections (" + f.gaps.join(",") + ")");
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
