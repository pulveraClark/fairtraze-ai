// Local-only: the AI findings card with the short summary on top, at 375px. Checks no sideways scroll, no text
// under 12px, rows and buttons >= 40px (disclosure rows 44px), no Gini in the card. No backend.
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
// 375 = phone; 640 = a 1280px desktop at 200% zoom. Run: E2E_WIDTH=640 node e2e/aiSummaryCard.mjs
const WIDTH = Number(process.env.E2E_WIDTH ?? 375);
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

try {
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/e2e/aiSummaryCard.html`);
  await page.getByRole("heading", { name: "AI findings" }).waitFor();
  await page.getByText("Needs a look (4 of 10)").waitFor();
  await page.waitForTimeout(300);

  const measure = () => page.evaluate(() => {
    const card = document.querySelector("#narrative-title").closest("section");
    const tiny = [...card.querySelectorAll("*")].filter((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      return own && parseFloat(getComputedStyle(el).fontSize) < 11.99;
    }).length;
    const small = [...card.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height) })).filter((b) => b.h < 40 && b.t !== ""); // the (?) InfoTip is an existing shared control
    const rows = [...card.querySelectorAll("button[aria-expanded]")].filter((b) => /covered requirement/.test(b.textContent.trim())).map((b) => b.getBoundingClientRect().height);
    return { scrollW: document.documentElement.scrollWidth, tiny, small, rows, text: card.textContent };
  });

  let m = await measure();
  check(m.scrollW <= WIDTH, `no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `no text under 12px (${m.tiny})`);
  check(m.small.length === 0, `buttons >= 40px ${JSON.stringify(m.small)}`);
  check(m.rows.length === 1 && m.rows.every((h) => h >= 44), `the disclosure row >= 44px (${m.rows.join(", ")})`);
  check(!/Gini/.test(m.text) && !/Team details/.test(m.text), "no Gini and no Team details row in the card");
  check(m.text.includes("Needs a look (4 of 10)") && m.text.includes("+2 more"), "Needs a look (4 of 10) with 2 items and +2 more");
  check(!/Instructions: \d+ of/.test(m.text) && !m.text.includes("covered requirements · show"), "no 'Instructions: k of M' line and no inner covered toggle");
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__ai-findings-375.png") });

  await page.getByRole("button", { name: "+2 more" }).click();
  await page.waitForTimeout(200);
  m = await measure();
  check(m.scrollW <= WIDTH, `all 4 items shown: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `all 4 items shown: no text under 12px (${m.tiny})`);
  check(m.small.length === 0, `all 4 items shown: buttons >= 40px ${JSON.stringify(m.small)}`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__ai-findings-expanded-375.png") });
  // Covered requirements shown, then one proof open: still one line each, no overflow, small targets absent.
  await page.getByRole("button", { name: "6 covered requirements, with proof" }).click();
  await page.waitForTimeout(150);
  m = await measure();
  check(m.scrollW <= WIDTH, `covered shown: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `covered shown: no text under 12px (${m.tiny})`);
  check(m.small.length === 0, `covered shown: buttons >= 40px ${JSON.stringify(m.small)}`);
  const proofs = await page.getByRole("button", { name: /^Proof/ }).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  check(proofs.length === 6 && proofs.every((h) => h >= 40), `6 Proof buttons, each >= 40px (${proofs.join(", ")})`);
  const open = await page.getByRole("button", { name: "Open file (new tab)" }).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(open >= 40, `Open file button is ${open}px tall`);
  // The quiet instructor action and the disclosure row.
  const disclosure = await page.getByRole("button", { name: /^6 covered requirements, with proof/ }).evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width), pw: Math.round(e.parentElement.getBoundingClientRect().width), right: Math.round(e.getBoundingClientRect().right), pright: Math.round(e.parentElement.getBoundingClientRect().right), exp: e.getAttribute("aria-expanded") }));
  if (WIDTH <= 375) {
    check(disclosure.h >= 44 && disclosure.exp === "true" && disclosure.w >= disclosure.pw - 25 /* the card pads its content by 12px a side */, `covered disclosure row is full width and ${disclosure.h}px tall, aria-expanded=${disclosure.exp} w=${disclosure.w} parent=${disclosure.pw}`);
  } else {
    // Wider screens put "View the instructions" and the (i) beside the row, so it need not be full width.
    check(disclosure.h >= 44 && disclosure.exp === "true" && disclosure.right <= disclosure.pright + 1, `covered disclosure row is ${disclosure.h}px tall, aria-expanded=${disclosure.exp}, fits inside its parent (right ${disclosure.right} <= ${disclosure.pright})`);
    const reach = await page.evaluate(() => {
      const row = [...document.querySelectorAll("button[aria-expanded]")].find((b) => /covered requirement/.test(b.textContent));
      const bar = row.parentElement;
      const link = [...bar.querySelectorAll("button")].find((b) => b.textContent.trim() === "View the instructions");
      const tip = bar.querySelector("button[aria-label='About the project instructions check']");
      const inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.left >= 0 && r.right <= document.documentElement.clientWidth && r.right <= bar.getBoundingClientRect().right + 1; };
      return { link: inView(link), tip: inView(tip) };
    });
    check(reach.link && reach.tip, `"View the instructions" and the (i) are visible and inside the row (link ${reach.link}, (i) ${reach.tip})`);
    await page.getByRole("button", { name: "About the project instructions check" }).focus();
    check(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "About the project instructions check"), "the (i) can take keyboard focus");
  }
  const mark = page.getByRole("button", { name: "Mark as covered" }).first();
  const markInfo = await mark.evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), fs: parseFloat(getComputedStyle(e).fontSize), sameLine: !!e.parentElement.querySelector("a, button:not([aria-label='x'])") }));
  check(markInfo.h >= 40 && markInfo.fs >= 12, `"Mark as covered" is ${markInfo.h}px tall, ${markInfo.fs}px text`);
  if (shots) await mark.locator("xpath=ancestor::li").screenshot({ path: path.join(shots, "instructions-check__mark-as-covered-375.png") });
  check(m.text.includes("From attached file: Final-Project-Instructions"), "long file name shown after 'From attached file:'");
  check(m.text.includes("Instructions changed since your mark. Check again."), "stale note on its own row");
  const tipH = await page.getByRole("button", { name: "About the project instructions check" }).evaluate((e) => Math.round(e.getBoundingClientRect().height));
  check(tipH >= 40, `(i) button is ${tipH}px tall`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__rows-covered-375.png") });
  await page.getByRole("button", { name: /^Proof/ }).first().click();
  await page.waitForTimeout(150);
  m = await measure();
  check(m.scrollW <= WIDTH, `proof open: no sideways scroll (scrollWidth ${m.scrollW})`);
  check(m.tiny === 0, `proof open: no text under 12px (${m.tiny})`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "ai-summary__rows-proof-375.png") });

  // Code proof: file and lines + quote; lines with the quote hidden; the file only. Every proof open.
  for (const b of await page.getByRole("button", { name: /^Proof/ }).all()) {
    if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
  }
  await page.waitForTimeout(150);
  const withLines = page.getByRole("link", { name: "Open Graphhopper.py, lines 12 to 14, on GitHub (new tab)" });
  const hiddenQuote = page.getByRole("link", { name: "Open Graphhopper.py, lines 20 to 22, on GitHub (new tab)" });
  const fileOnly = page.getByRole("link", { name: "Open Graphhopper.py file on GitHub (new tab)" });
  check((await withLines.count()) === 1 && (await hiddenQuote.count()) === 1 && (await fileOnly.count()) === 1, "the three code links are named 'Open Graphhopper.py, lines 12 to 14, on GitHub (new tab)', '..., lines 20 to 22, ...' and '... file ...'");
  check((await withLines.textContent()) === "server/routing/Graphhopper.py, lines 12-14", `link text reads the path and 'lines 12-14' (${await withLines.textContent()})`);
  check((await withLines.getAttribute("href")).endsWith("#L12-L14") && !(await fileOnly.getAttribute("href")).includes("#L"), "the lines link has #L12-L14; the file-only link has no #L");
  const codeRows = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("a[aria-label^='Open Graphhopper.py']")].map((a) => a.closest("li"));
    const quote = rows[0].querySelector("blockquote");
    return {
      targets: [...document.querySelectorAll("a[aria-label^='Open Graphhopper.py']")].map((a) => Math.round(a.getBoundingClientRect().height)),
      quoteFont: quote ? parseFloat(getComputedStyle(quote).fontSize) : 0,
      quoteLines: quote ? Math.round(quote.getBoundingClientRect().height / parseFloat(getComputedStyle(quote).lineHeight)) : 0,
      quoteRight: quote ? Math.round(quote.getBoundingClientRect().right) : 0,
      rowRight: Math.round(rows[0].getBoundingClientRect().right),
      quotes: rows.map((li) => li.querySelectorAll("blockquote").length),
      scrollW: document.documentElement.scrollWidth,
    };
  });
  check(codeRows.targets.every((h) => h >= 40), `code links are >= 40px tall (${codeRows.targets.join(", ")})`);
  check(codeRows.quoteFont >= 12, `the quote is ${codeRows.quoteFont}px`);
  check(codeRows.quoteLines >= 2 && codeRows.quoteRight <= codeRows.rowRight, `the long quote wraps (${codeRows.quoteLines} lines) and stays inside its row (${codeRows.quoteRight} <= ${codeRows.rowRight})`);
  check(codeRows.quotes.join() === "1,0,0", `a quote under the first link only; none when hidden or without lines (${codeRows.quotes.join()})`);
  check(codeRows.scrollW <= WIDTH, `code proofs open: no sideways scroll (scrollWidth ${codeRows.scrollW})`);
  m = await measure();
  check(m.tiny === 0 && m.small.length === 0, `code proofs open: no text under 12px (${m.tiny}), buttons >= 40px ${JSON.stringify(m.small)}`);
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, `ai-summary__code-proof-${WIDTH}.png`) });
  await page.getByRole("button", { name: "About the project instructions check" }).click();
  if (shots) await page.screenshot({ path: path.join(shots, "ai-summary__tip-open-375.png") });
  if (shots) await page.locator("#narrative-title").locator("xpath=ancestor::section").screenshot({ path: path.join(shots, "instructions-check__covered-list-open-375.png") });

  // The leader's row with its claim panel open: nothing squeezed.
  const lp = await ctx.newPage();
  await lp.goto(`http://localhost:${PORT}/e2e/aiSummaryCard.html?leader=1`);
  await lp.getByText("Project instructions check").first().click();
  await lp.getByRole("button", { name: "We have this" }).first().click();
  await lp.waitForTimeout(200);
  const lm = await lp.evaluate(() => {
    const card = document.querySelector("#leader-card");
    const tiny = [...card.querySelectorAll("*")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 11.99).length;
    const small = [...card.querySelectorAll("button, input")].filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 40 && b.type !== "file" && !b.closest("[role=tooltip]") && b.getAttribute("aria-label") !== "About the project instructions check").map((b) => b.textContent.trim().slice(0, 30));
    return { scrollW: document.documentElement.scrollWidth, tiny, small };
  });
  check(lm.scrollW <= WIDTH, `leader claim panel: no sideways scroll (scrollWidth ${lm.scrollW})`);
  check(lm.tiny === 0, `leader claim panel: no text under 12px (${lm.tiny})`);
  check(lm.small.length === 0, `leader claim panel: targets >= 40px ${JSON.stringify(lm.small)}`);
  if (shots) await lp.locator("#leader-card").screenshot({ path: path.join(shots, "instructions-check__leader-claim-open-375.png") });
  check(errors.length === 0, `no page errors ${errors.join("; ")}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
