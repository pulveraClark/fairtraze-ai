// Local-only: the "Worked on by" rows in the Project instructions check at 375px (leader view). No backend.
// Checks no sideways scroll, no text under 12px, the line wraps inside the card. Run: node e2e/workedOnBy.mjs [screenshot-dir]
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

try {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/e2e/workedOnBy.html`);
  await page.getByText("Project instructions check").click();
  await page.getByRole("button", { name: /covered/i }).click();
  await page.getByText("Worked on by").first().waitFor();
  const m = await page.evaluate(() => {
    const card = document.querySelector("details");
    const box = card.getBoundingClientRect();
    const wide = [...card.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > box.right + 1).length;
    const tiny = [...card.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return own && parseFloat(getComputedStyle(el).fontSize) < 11.99;
    }).length;
    return { scrollW: document.documentElement.scrollWidth, wide, tiny, rows: card.querySelectorAll("li").length, text: card.textContent };
  });
  check(m.scrollW <= 375, `no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.wide === 0, `nothing past the card's right edge (${m.wide})`);
  check(m.tiny === 0, `no text under 12px (${m.tiny})`);
  check(m.text.includes("+1 more") && m.text.includes("No one found yet.") && m.text.includes("Not known."), "names, +N more, both empty wordings shown");
  check((m.text.match(/Shows who changed the files/g) ?? []).length === 1, "the note appears once");
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
  if (shots) await page.locator("details").first().screenshot({ path: path.join(shots, "worked-on-by__card-375.png") });
} finally {
  await browser.close();
  await server.close();
}
process.exit(failures ? 1 : 0);
