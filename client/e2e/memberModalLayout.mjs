// Local-only: the member details modal at 375, 768, 1024 and 1280px and at 200% zoom.
// Checks the two-column layout from lg (320px grey sidebar, sticky, one scroll area), single column below lg,
// full screen below sm, no sideways page scroll, nothing past the dialog edge, no text under 12px, Tab stays inside.
// No backend. Run: node e2e/memberModalLayout.mjs [screenshot-dir]
// Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5202;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

try {
  // [name, css width, css height, device scale]. A 1280px desktop at 200% zoom is a 640px CSS viewport.
  for (const [name, width, height, dsf] of [
    ["phone-375", 375, 800, 1], ["tablet-768", 768, 900, 1], ["lg-1024", 1024, 800, 1], ["desktop-1280", 1280, 800, 1], ["zoom-200", 640, 480, 2],
  ]) {
    const lg = width >= 1024;
    const sm = width >= 640;
    console.log(`\n== ${name} (${width}x${height}, device scale ${dsf})`);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/e2e/memberModalLayout.html`);
    const dlg = page.getByRole("dialog");
    await dlg.waitFor();
    await page.waitForTimeout(300);

    const geo = await page.evaluate(() => {
      const r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const d = document.querySelector("[role=dialog]");
      const side = document.querySelector("[data-testid=modal-sidebar]");
      const main = document.querySelector("[data-testid=modal-main]");
      return {
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        dlg: r(d), side: r(side), main: r(main), sideBg: getComputedStyle(side).backgroundColor,
        over: [...d.querySelectorAll("*")].filter((e) => !e.closest("svg") && e.getBoundingClientRect().right > d.getBoundingClientRect().right + 1 && getComputedStyle(e).position !== "absolute").length,
      };
    });
    check(geo.sw <= geo.cw, `no sideways page scroll (${geo.sw} <= ${geo.cw})`);
    check(geo.over === 0, `nothing runs past the dialog's right edge (${geo.over})`);
    check(geo.dlg.x >= -0.5 && geo.dlg.r <= width + 0.5 && geo.dlg.y >= -0.5 && geo.dlg.b <= height + 0.5, `dialog inside the viewport (${Math.round(geo.dlg.w)}x${Math.round(geo.dlg.h)})`);
    if (!sm) check(Math.abs(geo.dlg.w - width) < 1 && Math.abs(geo.dlg.h - height) < 1, "full screen below sm");
    if (sm) check(geo.dlg.w <= 1040.5, `centered, at most 1040px wide (${Math.round(geo.dlg.w)})`);
    check(geo.sideBg !== "rgba(0, 0, 0, 0)" && geo.sideBg !== "rgb(255, 255, 255)", `sidebar has the light grey background (${geo.sideBg})`);
    if (lg) {
      check(Math.abs(geo.side.w - 320) <= 1, `sidebar is 320px wide (${geo.side.w})`);
      check(geo.main.x >= geo.side.r - 1 && Math.abs(geo.main.y - geo.side.y) < 1, "two columns side by side above lg");
    } else {
      check(geo.main.y >= geo.side.b - 1 && Math.abs(geo.main.x - geo.side.x) < 1 && geo.side.w >= geo.dlg.w - 2, "single column below lg: summary above details, full width");
    }

    const tiny = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] *")]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg") && !e.classList.contains("sr-only"))
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
      .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`));
    check(tiny.length === 0, `no text under 12px ${tiny.slice(0, 3).join(" | ")}`);

    // Open every section so the right column is taller than the left, then scroll the body.
    for (const label of [/Where the work went/, /Commit impact/, /Raw numbers/, /FairTraze Docs activity/]) {
      const b = page.getByRole("button", { name: label });
      if ((await b.getAttribute("aria-expanded")) !== "true") await b.click();
    }
    await page.waitForTimeout(150);
    const scrollers = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] *")]
      .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ${e.scrollHeight}>${e.clientHeight}`));
    // The body is the one scroll area; the sticky sidebar may scroll inside itself only when it is taller than the dialog (lg and up).
    const extra = scrollers.filter((x) => !x.startsWith("div.min-h-0") && !(lg && x.includes("lg:sticky")));
    check(scrollers.filter((x) => x.startsWith("div.min-h-0")).length === 1 && extra.length === 0, `the body is the only scroll area (sidebar scrolls itself only if taller than the dialog): ${scrollers.join(" | ")}`);
    const sticky = await page.evaluate(() => {
      const side = document.querySelector("[data-testid=modal-sidebar]");
      const inner = side.firstElementChild;
      const body = side.parentElement;
      body.style.scrollBehavior = "auto";
      body.scrollTop = 0;
      const before = inner.getBoundingClientRect().top - body.getBoundingClientRect().top;
      body.scrollTop = Math.min(300, body.scrollHeight);
      const after = inner.getBoundingClientRect().top - body.getBoundingClientRect().top;
      const scrolled = body.scrollTop;
      body.scrollTop = 0;
      return { before, after, scrolled, sideH: side.getBoundingClientRect().height, bodyH: body.scrollHeight };
    });
    if (lg) {
      check(sticky.scrolled > 0, `body scrolls as one (scrollTop ${sticky.scrolled})`);
      check(Math.abs(sticky.after - sticky.before) < 1.5, `sidebar content stays put while the body scrolls (${sticky.before.toFixed(0)} -> ${sticky.after.toFixed(0)})`);
      check(sticky.sideH >= sticky.bodyH - 2, "grey column runs the full height of the body");
    } else if (sticky.scrolled > 0) {
      check(sticky.after < sticky.before - 1, `below lg the summary scrolls away with the body (${sticky.before.toFixed(0)} -> ${sticky.after.toFixed(0)}, scrollTop ${sticky.scrolled})`);
    }

    // Prev/next and focus stay inside; the dialog is not remounted.
    await page.getByRole("button", { name: "Next member" }).click();
    await page.waitForTimeout(150);
    check(await page.getByText("Member 2 of 3").first().isVisible(), "Member 2 of 3 after Next");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(150);
    check(await page.getByText("Member 1 of 3").first().isVisible(), "← goes back to Member 1 of 3");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    check(await page.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement)), "Tab stays inside the dialog");

    // A tooltip opened from the sidebar must not be clipped by the sidebar's own scroll box.
    const tipBtn = page.locator("[data-testid=modal-sidebar] button[aria-label^='About']").first();
    await tipBtn.focus();
    await page.getByRole("tooltip").waitFor();
    await page.waitForTimeout(100);
    const tip = await page.getByRole("tooltip").boundingBox();
    check(tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= width + 0.5 && tip.y + tip.height <= height + 0.5, `sidebar tooltip fully on screen (${Math.round(tip.x)},${Math.round(tip.y)} ${Math.round(tip.width)}x${Math.round(tip.height)})`);

    if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
    check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
