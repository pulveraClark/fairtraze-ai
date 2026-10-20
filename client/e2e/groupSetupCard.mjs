// Local-only: the group setup card and Next-step line at 1280 and 375px in each state.
// Checks no sideways page scroll, nothing clipped past the card, no text under 12px, a visible focus outline and
// 32px-tall buttons; writes screenshots when a directory is given. No backend.
// Run: node e2e/groupSetupCard.mjs [screenshot-dir]    (ux-audit/after for the audit set)
// Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5203;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

// [state, what to do before the screenshot]
const STATES = [
  ["not-started", async () => {}],
  ["format-error", async (page) => {
    await page.getByLabel("Repository link", { exact: true }).fill("https://gitlab.com/acme/app");
    await page.getByLabel("Repository link", { exact: true }).blur();
  }],
  ["server-error", async (page) => {
    await page.getByLabel("Repository link", { exact: true }).fill("github.com/acme/missing-repo");
    await page.getByRole("button", { name: "Save link" }).click();
    await page.getByRole("alert").waitFor();
  }],
  ["partial", async () => {}],
  ["leader-partial", async () => {}],
  ["nudge", async () => {}],
  ["next-step", async () => {}],
  ["all-set", async () => {}],
];

try {
  for (const width of [1280, 375]) {
    for (const [state, act] of STATES) {
      console.log(`\n== ${state} @ ${width}px`);
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`http://localhost:${PORT}/e2e/groupSetupCard.html?state=${state}`);
      await page.locator("main").waitFor();
      await page.waitForTimeout(250);
      await act(page);
      await page.waitForTimeout(150);

      const m = await page.evaluate(() => {
        const main = document.querySelector("main");
        const box = main.firstElementChild?.getBoundingClientRect();
        const tiny = [...main.querySelectorAll("*")]
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg") && !e.classList.contains("sr-only"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const clipped = box
          ? [...main.firstElementChild.querySelectorAll("*")].filter((e) => !e.closest("svg") && !e.classList.contains("sr-only") && e.getBoundingClientRect().right > box.right + 1).length
          : 0;
        // The shared (?) InfoTip button is 24px everywhere in the app (WCAG 2.2 minimum), so it is not held to 32px here.
        const short = [...main.querySelectorAll("button, a[href]")].filter((e) => !(e.getAttribute("aria-label") ?? "").startsWith("About"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && !e.closest("p") && b.height < 31.5 && !e.classList.contains("underline"); })
          .map((e) => `${e.textContent.trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, clipped, short };
      });
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.clipped === 0, `nothing runs past the card's right edge (${m.clipped})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      check(m.short.length === 0, `buttons are at least 32px tall ${m.short.join(" | ")}`);
      check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(" | ")}`);

      if (state === "not-started") {
        await page.keyboard.press("Tab");
        const focus = await page.evaluate(() => {
          const e = document.activeElement;
          const cs = getComputedStyle(e);
          return { tag: e.tagName, outline: cs.outlineStyle, w: parseFloat(cs.outlineWidth) };
        });
        check(focus.outline !== "none" && focus.w >= 2, `first Tab stop has a visible focus outline (${focus.tag}, ${focus.outline} ${focus.w}px)`);
      }
      if (state === "nudge") {
        check(await page.getByText("Setup 2 of 3").isVisible(), "nudge bar shows progress");
        await page.getByRole("button", { name: "Finish setup" }).click();
        check(await page.getByRole("dialog", { name: "Finish group setup" }).isVisible(), "Finish setup opens the steps");
        await page.keyboard.press("Escape");
        check(!(await page.getByRole("dialog").count()), "Esc closes the steps");
      }
      if (state === "format-error") check(await page.getByText(/not a GitHub link/).isVisible(), "format error is shown in words");
      if (state === "server-error") {
        check((await page.getByRole("alert").innerText()).endsWith("Make the repository public, or ask your instructor how to share it."), "server error ends with the one clear action");
      }

      if (shots) await page.screenshot({ path: path.join(shots, `student__setup-${state}__${width}.png`), fullPage: true });
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
