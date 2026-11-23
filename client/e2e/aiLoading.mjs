// Local-only: the loading state of "Writing AI findings…" in Member contributions and the AI findings card at 375px.
// Checks no sideways scroll, the busy disabled button (>= 40px), the status text and 3 skeleton lines in the card,
// no text under 12px. No backend.
// Run: node e2e/aiLoading.mjs [screenshot-dir]
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5206;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

try {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/e2e/aiLoading.html`);
  await page.getByRole("heading", { name: "Member contributions" }).waitFor();
  await page.waitForTimeout(400);

  const m = await page.evaluate(() => {
    const btn = document.querySelector("button[aria-busy='true']");
    const card = document.querySelector("#narrative-title")?.closest("section");
    const tiny = [...document.querySelectorAll("body *")].filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return own && parseFloat(getComputedStyle(el).fontSize) < 11.99;
    }).length;
    return {
      scrollW: document.documentElement.scrollWidth,
      btnH: btn ? btn.getBoundingClientRect().height : 0,
      btnDisabled: btn?.disabled,
      skeletons: card ? card.querySelectorAll("[data-skeleton] > div").length : 0,
      cardText: card?.textContent ?? "",
      tiny,
    };
  });
  check(m.scrollW <= 375, `no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.btnDisabled === true && m.btnH >= 40, `busy button disabled, ${m.btnH}px tall`);
  check(m.cardText.includes("Writing AI findings…"), "AI findings card says Writing AI findings…");
  check(m.skeletons === 3, `AI findings card has ${m.skeletons} skeleton lines`);
  check(!m.cardText.includes("leave this page"), "no leave-the-page line in the AI findings card");
  check(m.tiny === 0, `no text under 12px (${m.tiny})`);
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);

  if (shots) {
    await page.locator("#member-contributions-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-loading__member-contributions-375.png") });
    await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-loading__ai-findings-375.png") });
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
