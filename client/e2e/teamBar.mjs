// Local-only: the split Team contributions bar at 375px. No backend. Run: node e2e/teamBar.mjs [screenshot-dir]
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

try {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/e2e/teamBar.html`);
  await page.getByText("Team contributions").waitFor();
  const m = await page.evaluate(() => {
    const card = document.querySelector("section");
    const box = card.getBoundingClientRect();
    const wide = [...card.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > box.right + 1).length;
    const tiny = [...card.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return own && parseFloat(getComputedStyle(el).fontSize) < 11.99;
    }).length;
    const btn = [...card.querySelectorAll("button[data-open-member]")].map((b) => b.getBoundingClientRect().height);
    const bars = [...card.querySelectorAll("[data-testid=share-bar]")].map((b) => b.getAttribute("aria-label"));
    const colors = ["github", "docs"].map((k) => getComputedStyle(card.querySelector(`[data-testid=share-bar-${k}]`)).backgroundColor);
    return { scrollW: document.documentElement.scrollWidth, wide, tiny, btn, bars, colors };
  });
  check(m.scrollW <= 375, `no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.wide === 0, `nothing past the card's right edge (${m.wide})`);
  check(m.tiny === 0, `no text under 12px (${m.tiny})`);
  check(m.btn.length === 3 && m.btn.every((h) => h >= 40), `name buttons >= 40px (${m.btn.join(", ")})`);
  check(m.bars.length === 3 && m.bars.every((b) => /^GitHub [\d.]+ points, Docs [\d.]+ points, total [\d.]+ percent$/.test(b)), `bar labels: ${m.bars[0]}`);
  check(m.colors[0] === "rgb(37, 99, 235)" && m.colors[1] === "rgb(234, 88, 12)", `blue and orange (${m.colors.join(" / ")})`);
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
  if (shots) await page.locator("section").first().screenshot({ path: path.join(shots, "student__team-bar-375.png") });
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
