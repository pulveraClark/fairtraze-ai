// Local-only: the Help page at 1280 and 375px, signed in (inside the app shell) and signed out (standalone),
// plus a search with results and a search with none. Checks no sideways scroll, no text under 12px, a visible
// focus indicator on the search box, Help highlighted in the sidebar, #faq anchors, and Esc clearing. No backend.
// Run: node e2e/helpPage.mjs [screenshot-dir]    (ux-audit/after for the audit set)
// Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5204;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

// [name, signed in, what to do before the screenshot]
const STATES = [
  ["signed-in", true, async () => {}],
  ["signed-out", false, async () => {}],
  ["search-results", true, async (page) => { await page.getByRole("searchbox", { name: "Search help" }).fill("github"); }],
  ["search-none", true, async (page) => { await page.getByRole("searchbox", { name: "Search help" }).fill("zzzzqq"); }],
];

try {
  for (const width of [1280, 375]) {
    for (const [state, signedIn, act] of STATES) {
      console.log(`\n== ${state} @ ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://localhost:${PORT}/e2e/helpPage.html?auth=${signedIn ? 1 : 0}`);
      await page.getByRole("heading", { level: 1, name: "How FairTraze works" }).waitFor();
      await page.waitForTimeout(400);
      await act(page);
      await page.waitForTimeout(250);

      const m = await page.evaluate(() => {
        const tiny = [...document.querySelectorAll("body *")]
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg") && !e.closest("[hidden]") && !e.classList.contains("sr-only"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        return {
          sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny,
          helpActive: !!document.querySelector('a[href="/help"][aria-current="page"]'),
          back: [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Back"),
        };
      });
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);

      if (state === "signed-in") {
        // On a phone the sidebar is a drawer, so the Help link is only in the DOM on desktop widths.
        if (width >= 768) check(m.helpActive, "Help is highlighted in the sidebar");
        check(!m.back, "no standalone Back button inside the app shell");
        const box = page.getByRole("searchbox", { name: "Search help" });
        await box.focus();
        const focus = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { o: cs.outlineStyle, w: parseFloat(cs.outlineWidth), sh: cs.boxShadow }; });
        check((focus.o !== "none" && focus.w >= 2) || focus.sh !== "none", `search box has a visible focus indicator (${focus.o} ${focus.w}px)`);
        await box.fill("flags");
        await page.keyboard.press("Escape");
        check((await box.inputValue()) === "", "Esc clears the search");
        await page.evaluate(() => { location.hash = "#faq"; });
        await page.waitForTimeout(300);
        const top = await page.evaluate(() => Math.round(document.getElementById("faq").getBoundingClientRect().top));
        check(top >= -2 && top < 400, `#faq scrolled into view (top ${top}px)`);
      }
      if (state === "signed-out") {
        check(m.back && !m.helpActive, "standalone page: Back button, no sidebar");
      }
      if (state === "search-results") {
        check(await page.getByText("How do I link GitHub?").isVisible(), "matching question is shown");
        check(/match/.test(await page.getByRole("status").innerText()), "result count is announced");
        const marks = await page.evaluate(() => (CSS.highlights ? CSS.highlights.size : -1));
        check(marks !== 0, `matched words highlighted (highlights: ${marks})`);
      }
      if (state === "search-none") {
        check((await page.getByRole("status").innerText()).includes("No results. Try 'flags' or 'tasks'."), "empty state message shown");
      }
      check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);

      if (shots) await page.screenshot({ path: path.join(shots, `help__${state}__${width}.png`), fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
