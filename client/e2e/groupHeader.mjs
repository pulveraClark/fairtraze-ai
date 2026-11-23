// Local-only: the student group page header buttons (Instructions, Print evidence report, Manage Group) at
// 375px and 1280px, as leader (with and without an analysis) and as member. Checks that every button is fully
// inside the viewport (not clipped), the page does not scroll sideways, and touch height is 44px on a phone.
// No backend, no database (faked fetch).
// Run: node e2e/groupHeader.mjs [screenshot-dir]
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

const CASES = [
  ["leader", "role=LEADER&report=1", ["Instructions", "Print evidence report", "Manage Group"]],
  ["leader-no-report", "role=LEADER&report=0", ["Instructions", "Print evidence report", "Manage Group"]],
  ["member", "role=MEMBER&report=1", ["Instructions", "Manage Group"]],
];

try {
  for (const width of [375, 1280]) {
    for (const [name, query, buttons] of CASES) {
      console.log(`\n== ${name} @ ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://localhost:${PORT}/e2e/groupHeader.html?${query}`);
      try {
        await page.getByTestId("group-header-actions").waitFor({ timeout: 10000 });
      } catch (e) {
        console.log("page text:", (await page.locator("body").innerText()).slice(0, 300), errors.join(" | "));
        throw e;
      }
      await page.waitForTimeout(300);

      const m = await page.evaluate((names) => {
        const row = document.querySelector('[data-testid="group-header-actions"]');
        const found = names.map((n) => {
          const b = [...row.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") ?? x.textContent).trim().startsWith(n));
          if (!b) return { n, missing: true };
          const r = b.getBoundingClientRect();
          return { n, left: r.left, right: r.right, height: r.height };
        });
        return { found, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vw: window.innerWidth };
      }, buttons);

      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      for (const b of m.found) {
        if (b.missing) { check(false, `${b.n} is on the page`); continue; }
        check(b.left >= 0 && b.right <= m.vw + 0.5, `${b.n} fully inside the viewport (${b.left.toFixed(0)}..${b.right.toFixed(0)} of ${m.vw})`);
        if (width < 640) check(b.height >= 44, `${b.n} is at least 44px tall (${b.height.toFixed(0)})`);
      }
      check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);
      if (shots) await page.screenshot({ path: path.join(shots, `student__group-header-${name}-${width}.png`) });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
