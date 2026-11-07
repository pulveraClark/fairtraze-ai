// Local-only: the failure wording on screen at 375px and at 200% zoom (a 1280px desktop zoomed to 200% is a 640px
// CSS viewport): the red "Analysis failed" card for every message, the AI findings error / kept-explanation note /
// daily-limit line, and the "Last analyzed ... didn't finish" freshness line. Checks: no sideways page scroll,
// nothing past the right edge, no text under 12px, buttons at least 36px tall, and that the final sentences are
// on screen word for word. No backend.
// Run: node e2e/failureMessages.mjs [screenshot-dir]. Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5208;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };
const saved = [];

const WORDS = {
  "analysis-failed": [
    "GitHub is limiting requests right now. Wait about an hour, then select Re-analyze. The nightly update will also try again.",
    "We couldn't read the repository. Check that the link is correct and the repository is public, then select Re-analyze.",
    "GitHub access isn't set up on this server. Contact the FairTraze team.",
    "We couldn't reach GitHub. Try again in a few minutes.",
    "The analysis didn't finish. Try again in a few minutes. If it keeps happening, contact the FairTraze team.",
    "We couldn't reach the server. Check your connection, then try again.",
  ],
  "ai-findings": [
    "The AI explanation is unavailable right now. The scores and flags are not affected. Try again later.",
    "The new explanation could not be written, so the saved one is shown. Try again later.",
    "The AI's daily limit was reached. It is available again around 3:00 PM (in about 4 hours).",
  ],
  freshness: [
    "Last analyzed 3 days ago. The latest update didn't finish. It will try again tonight.",
    "Last analyzed 3 hours ago (automatic) · Updates automatically",
  ],
};

try {
  for (const scene of Object.keys(WORDS)) {
    for (const [name, width, height, dsf] of [["375", 375, 800, 1], ["zoom200", 640, 480, 2]]) {
      console.log(`\n== ${scene} @ ${name}`);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource|cannot contain a nested/.test(m.text())) errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/e2e/failureMessages.html?scene=${scene}`);
      await page.waitForTimeout(600);

      const m = await page.evaluate(() => {
        const root = document.querySelector("main");
        const area = [...root.querySelectorAll("*")].filter((e) => !e.closest("svg") && !e.classList.contains("sr-only"));
        const tiny = area
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const past = area.filter((e) => getComputedStyle(e).position !== "absolute" && e.getBoundingClientRect().right > window.innerWidth + 1).length;
        const short = area
          .filter((e) => e.matches("button, a[href]") && !(e.getAttribute("aria-label") ?? "").startsWith("About") && !e.closest("p"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 35.5; })
          .map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past, short, text: root.innerText.replace(/\s+/g, " ") };
      });
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.past === 0, `nothing runs past the right edge (${m.past})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      check(m.short.length === 0, `buttons are at least 36px tall ${m.short.join(" | ")}`);
      check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);
      for (const w of WORDS[scene]) check(m.text.includes(w), `shows: ${w.slice(0, 60)}${w.length > 60 ? "…" : ""}`);
      if (shots) {
        const file = `failure__${scene}__${name}.png`;
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
