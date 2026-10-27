// Local-only: the AI findings card with the short summary on top, at 375px. Checks no sideways scroll, no text
// under 12px, rows and buttons >= 40px (disclosure rows 44px), the Gini number hidden until Team details opens. No backend.
// Run: node e2e/aiSummaryCard.mjs [screenshot-dir]
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
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/e2e/aiSummaryCard.html`);
  await page.getByRole("heading", { name: "AI findings" }).waitFor();
  await page.getByText(/^Instructions: 6 of 10/).waitFor();
  await page.waitForTimeout(300);

  const measure = () => page.evaluate(() => {
    const card = document.querySelector("#narrative-title").closest("section");
    const tiny = [...card.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return own && parseFloat(getComputedStyle(el).fontSize) < 11.99;
    }).length;
    const small = [...card.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height) })).filter((b) => b.h < 40 && b.t !== ""); // the (?) InfoTip is an existing shared control
    const rows = [...card.querySelectorAll("button[aria-expanded]")].filter((b) => /^▸?s*(Team details|Project instructions check)/.test(b.textContent.trim())).map((b) => b.getBoundingClientRect().height);
    return { scrollW: document.documentElement.scrollWidth, tiny, small, rows, text: card.textContent };
  });

  let m = await measure();
  check(m.scrollW <= 375, `no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `no text under 12px (${m.tiny})`);
  check(m.small.length === 0, `buttons >= 40px ${JSON.stringify(m.small)}`);
  check(m.rows.length === 2 && m.rows.every((h) => h >= 44), `two disclosure rows >= 44px (${m.rows.join(", ")})`);
  check(!m.text.includes("0.122".replace("0.122", "The Gini")) && !/Gini coefficient is/.test(m.text), "Gini sentence hidden until Team details opens");
  check(m.text.includes("Needs a look") && m.text.includes("+2 more"), "Needs a look with 2 items and +2 more");
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__ai-findings-375.png") });

  await page.getByRole("button", { name: /^Team details/ }).click();
  await page.getByRole("button", { name: /Project instructions check · all 10/ }).click();
  await page.waitForTimeout(200);
  m = await measure();
  check(m.scrollW <= 375, `expanded: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `expanded: no text under 12px (${m.tiny})`);
  check(/Gini coefficient is 0.122/.test(m.text), "Gini sentence shown inside Team details");
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__ai-findings-expanded-375.png") });
  // Covered requirements shown, then one proof open: still one line each, no overflow, small targets absent.
  await page.getByRole("button", { name: /^Show the 6 covered requirements/ }).click();
  await page.waitForTimeout(150);
  m = await measure();
  check(m.scrollW <= 375, `covered shown: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `covered shown: no text under 12px (${m.tiny})`);
  check(m.small.length === 0, `covered shown: buttons >= 40px ${JSON.stringify(m.small)}`);
  const proofs = await page.getByRole("button", { name: /^Proof/ }).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(proofs.length === 6 && proofs.every((h) => h >= 40), `6 Proof buttons, each >= 40px (${proofs.join(", ")})`);
  const open = await page.getByRole("button", { name: "Open file (new tab)" }).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(open >= 40, `Open file button is ${open}px tall`);
  check(m.text.includes("From attached file: Final-Project-Instructions"), "long file name shown after 'From attached file:'");
  check(m.text.includes("Instructions changed since your mark. Check again."), "stale note on its own row");
  const tipH = await page.getByRole("button", { name: "About the project instructions check" }).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(tipH >= 40, `(i) button is ${tipH}px tall`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__rows-covered-375.png") });
  await page.getByRole("button", { name: /^Proof/ }).first().click();
  await page.waitForTimeout(150);
  m = await measure();
  check(m.scrollW <= 375, `proof open: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `proof open: no text under 12px (${m.tiny})`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__rows-proof-375.png") });
  await page.getByRole("button", { name: "About the project instructions check" }).click();
  if (shots) await page.screenshot({ path: path.join(shots, "ai-summary__tip-open-375.png") });
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
