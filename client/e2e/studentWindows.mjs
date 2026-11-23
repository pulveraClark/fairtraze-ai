// Local-only: the instructions window, the "We have this" box and the student member window at 375px (and 1280px).
// Checks no sideways page scroll, nothing past the screen edge, no text under 12px, 40px tap targets (the shared
// (?) InfoTip is 24px everywhere, links inside a sentence are not held to it), a visible focus outline, and
// that the window is a full-screen sheet on a phone. Writes screenshots when a directory is given. No backend.
// Run: node e2e/studentWindows.mjs [screenshot-dir]
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

const SCENES = [
  ["instructions", async (page) => { await page.getByRole("dialog").waitFor(); await page.locator("mark").waitFor(); }],
  ["marks-leader", async (page) => {
    await page.getByText("Project instructions check").click();
    await page.getByRole("button", { name: "We have this" }).click();
    await page.getByLabel(/Where is it/).fill("User Guide, page 3");
  }],
  ["marks-instructor", async (page) => {
    await page.getByText("Project instructions check").click();
    await page.getByText("Leader says this is covered. Waiting for you").waitFor();
  }],
  ["member-window", async (page) => { await page.getByRole("dialog").waitFor(); await page.getByText("What this member worked on").waitFor().catch(() => {}); }],
];

try {
  for (const width of [375, 1280]) {
    for (const [scene, act] of SCENES) {
      console.log(`\n== ${scene} @ ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://localhost:${PORT}/e2e/studentWindows.html?scene=${scene}`);
      await page.waitForTimeout(500);
      await act(page);
      await page.waitForTimeout(250);

      const m = await page.evaluate(() => {
        const root = document.querySelector('[role="dialog"]') ?? document.querySelector("main");
        const area = [...root.querySelectorAll("*")];
        const tiny = area
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg") && !e.classList.contains("sr-only"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const past = area.filter((e) => !e.closest("svg") && !e.classList.contains("sr-only") && getComputedStyle(e).position !== "fixed" && e.getBoundingClientRect().right > window.innerWidth + 1).length;
        const short = area.filter((e) => e.matches("button, a[href], input:not([type=file]), select"))
          .filter((e) => !(e.getAttribute("aria-label") ?? "").startsWith("About") && !e.closest("p") && !e.classList.contains("sr-only"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 39.5; })
          .map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
        const dlg = document.querySelector('[role="dialog"]')?.getBoundingClientRect();
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past, short, dlg: dlg ? { w: Math.round(dlg.width), h: Math.round(dlg.height) } : null, vh: window.innerHeight };
      });
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.past === 0, `nothing runs past the right edge of the screen (${m.past})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      check(m.short.length === 0, `tap targets are at least 40px tall ${m.short.join(" | ")}`);
      check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);
      if (width === 375 && (scene === "instructions" || scene === "member-window")) {
        check(!!m.dlg && m.dlg.w === 375 && m.dlg.h === m.vh, `the window is a full-screen sheet (${m.dlg?.w}x${m.dlg?.h})`);
      }

      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const e = document.activeElement;
        const cs = getComputedStyle(e);
        return { tag: e.tagName, outline: cs.outlineStyle, w: parseFloat(cs.outlineWidth), shadow: cs.boxShadow };
      });
      check((focus.outline !== "none" && focus.w >= 2) || focus.shadow !== "none", `a Tab stop shows a visible focus indicator (${focus.tag}, ${focus.outline} ${focus.w}px)`);

      if (scene === "member-window") {
        await page.getByRole("button", { name: "Next member" }).click();
        check(await page.getByText("Member 2 of 3").first().isVisible(), "the arrows move to the next member");
        check(!(await page.getByText(/commit impact|lines added|churn/i).count()), "no commit impact or raw numbers in the window");
      }
      if (scene === "marks-leader") {
        check(await page.getByRole("button", { name: "Add a picture" }).isVisible(), "'Add a picture' is there as the keyboard and phone fallback");
      }
      if (shots) await page.screenshot({ path: path.join(shots, `${scene}__${width}.png`), fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
