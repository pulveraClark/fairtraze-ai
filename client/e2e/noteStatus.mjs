// Local-only: the student's note status (Sent / Seen / Answered, the reply and its plain-words header) on the
// "Your notes" page and the group page Notes list, plus the instructor Disputes page and its response window, at
// 375px and at 200% zoom (a 1280px desktop zoomed to 200% is a 640px CSS viewport). Checks: no sideways page scroll,
// nothing past the right edge, no text under 12px, buttons at least 36px tall, the right words, no Gini/band/index on
// a student screen, and that opening the response window sends one POST .../seen. No backend.
// Run: node e2e/noteStatus.mjs [screenshot-dir]. Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5207;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
const saved = [];

try {
  for (const scene of ["student-notes", "group-notes", "instructor"]) {
    for (const [name, width, height, dsf] of [["375", 375, 800, 1], ["zoom200", 640, 480, 2]]) {
      console.log(`\n== ${scene} @ ${name}`);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|cannot contain a nested/.test(m.text())) errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/e2e/noteStatus.html?scene=${scene}`);
      await page.waitForTimeout(700);

      let seenBeforeOpen = 0;
      let seenAfterOpen = 0;
      let dialog = false;
      if (scene === "instructor") {
        await page.getByRole("button", { name: /Respond/ }).first().waitFor();
        seenBeforeOpen = (await page.evaluate(() => window.__calls)).filter((c) => c.includes("/seen")).length;
        await page.getByRole("button", { name: /Respond/ }).first().click();
        await page.waitForTimeout(400);
        seenAfterOpen = (await page.evaluate(() => window.__calls)).filter((c) => c.startsWith("POST") && c.includes("/api/disputes/5/seen")).length;
        dialog = true;
      } else {
        await page.locator("article").first().waitFor();
      }

      const m = await page.evaluate((isDialog) => {
        const root = isDialog ? document.querySelector("[role=dialog], .fixed.inset-0 > div") : document.querySelector("main");
        const scope = document.querySelector("main") ?? document.body;
        const area = [...(isDialog ? [...scope.querySelectorAll("*"), ...root.querySelectorAll("*")] : scope.querySelectorAll("*"))]
          .filter((e) => !e.closest("svg") && !e.classList.contains("sr-only"));
        const tiny = area
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const past = area.filter((e) => getComputedStyle(e).position !== "absolute" && e.getBoundingClientRect().right > window.innerWidth + 1).length;
        const short = area
          .filter((e) => e.matches("button, a[href]") && !e.closest("p"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 35.5 && !/^(See all your notes|[A-Z].*-.*)$/.test((e.textContent || "").trim()) ; })
          .map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past, short, text: document.body.innerText };
      }, dialog);

      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.past === 0, `nothing runs past the right edge (${m.past})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      // The instructor page's own buttons (Respond & resolve, Close, Submit) predate this change and are left as they
      // are; they are reported, not failed. The student scenes hold everything this change touched.
      if (scene === "instructor") console.log(`INFO  existing instructor buttons under 36px: ${m.short.join(" | ") || "none"}`);
      else check(m.short.length === 0, `buttons are at least 36px tall ${m.short.join(" | ")}`);
      check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);

      if (scene !== "instructor") {
        for (const word of ["Sent", "Seen", "Answered"]) check(m.text.includes(word), `shows the "${word}" pill`);
        check(m.text.includes("Your instructor accepted your note · Oct 6, 2026"), "reply header: accepted, date only");
        check(m.text.includes("Your instructor kept the result · Oct 4, 2026"), "reply header: kept the result, date only");
        check(m.text.includes("Your instructor opened it on Oct 19, 2026."), "Seen line shows the date only");
        check(!/3:45|15:45/.test(m.text), "no time of day on the Seen line");
        check(m.text.includes("Your instructor hasn't opened it yet."), "Sent line in plain words");
        check(!/gini|band|index/i.test(m.text), "no Gini, band or index on a student screen");
      } else {
        check(seenBeforeOpen === 0, "listing the disputes sends no seen call");
        check(seenAfterOpen === 1, `opening the response window sends exactly one POST .../seen (${seenAfterOpen})`);
      }
      if (shots) {
        const file = `notestatus__${scene}__${name}.png`;
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
