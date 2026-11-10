// Local-only: the "Early data" tag (instructor report tile and member list, member drawer, student overview, student
// member window) and the longer AI footer line at 375px and at 200% zoom (a 1280px desktop zoomed to 200% is a
// 640px CSS viewport). Checks: no sideways page scroll, nothing past the right edge, no text under 12px, buttons at
// least 36px tall (the (?) tips are the shared 24px control, as everywhere), the right words for low/medium, no
// digits in the tag, flags grey on low and coloured on medium, no "Gini" in any student scene. No backend.
// Run: node e2e/earlyData.mjs [screenshot-dir]. Included in `npm run test:e2e -w client`.
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
const saved = [];

// [scene, level, is the root a dialog?]
const SCENES = [
  ["instructor", "low", false], ["instructor", "medium", false],
  ["member-drawer", "low", true], ["member-drawer", "medium", true],
  ["student", "low", false], ["student", "medium", false],
  ["student-window", "low", true],
  ["footer", "medium", false],
];

try {
  for (const [scene, level, dialog] of SCENES) {
    for (const [name, width, height, dsf] of [["375", 375, 800, 1], ["zoom200", 640, 480, 2]]) {
      console.log(`\n== ${scene} (${level}) @ ${name}`);
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: width < 600 });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/e2e/earlyData.html?scene=${scene}&level=${level}`);
      await page.waitForTimeout(500);
      if (dialog) await page.getByRole("dialog").waitFor();

      const m = await page.evaluate((isDialog) => {
        const root = isDialog ? document.querySelector("[role=dialog]") : document.querySelector("main");
        const rb = root.getBoundingClientRect();
        const area = [...root.querySelectorAll("*")].filter((e) => !e.closest("svg") && !e.classList.contains("sr-only"));
        const tiny = area
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && parseFloat(getComputedStyle(e).fontSize) < 12; })
          .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)}`);
        const past = area.filter((e) => getComputedStyle(e).position !== "absolute" && e.getBoundingClientRect().right > Math.max(rb.right, window.innerWidth) + 1).length;
        const short = area
          .filter((e) => e.matches("button, a[href]") && !(e.getAttribute("aria-label") ?? "").startsWith("About") && !e.closest("p"))
          .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height < 35.5; })
          .map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 24)} (${Math.round(e.getBoundingClientRect().height)}px)`);
        const pill = (re) => [...root.querySelectorAll("span")].find((e) => re.test(e.textContent.trim()) && e.children.length <= 1 && /rounded/.test(e.className));
        const cls = (re) => pill(re)?.className ?? "";
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tiny, past, short, text: root.innerText, flagCls: cls(/^(Free-rider|Low contribution)$/), healthCls: cls(/^(High risk|Work is very uneven)$/) };
      }, dialog);
      check(m.sw <= m.cw, `no sideways page scroll (${m.sw} <= ${m.cw})`);
      check(m.past === 0, `nothing runs past the right edge (${m.past})`);
      check(m.tiny.length === 0, `no text under 12px ${m.tiny.slice(0, 3).join(" | ")}`);
      check(m.short.length === 0, `buttons are at least 36px tall ${m.short.join(" | ")}`);
      check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(" | ")}`);

      if (scene !== "footer" && scene !== "member-drawer" && scene !== "student-window") {
        const want = "Early data";
        check(m.text.includes(want), `tag reads "${want}"`);
        check(!/too early to tell/.test(m.text), "the long sentence is not printed beside the tag");
        check(!/Early data[^\n]*\d/.test(m.text), "no day count in the tag");
      }
      if (scene === "instructor" || scene === "student") {
        check(level === "low" ? /slate/.test(m.healthCls) && !/red-|emerald-|amber-/.test(m.healthCls) : !/slate-100/.test(m.healthCls), `health pill is ${level === "low" ? "grey" : "in its alert colour"}`);
      }
      if (scene === "instructor" || scene === "student" || scene === "member-drawer" || scene === "student-window") {
        check(level === "low" ? /slate-100/.test(m.flagCls) && !/red-100|amber-50/.test(m.flagCls) : !/slate-100/.test(m.flagCls), `flag pill is ${level === "low" ? "grey" : "in its alert colour"}, same words`);
      }
      if (scene === "member-drawer" && level === "medium") check(m.text.includes("Flags may change as more activity is recorded."), "medium: flags 'may change' line in the member window");
      if (scene === "student") {
        check(m.text.includes(level === "low" ? "This is early data, so these notes may change as more work is recorded." : "These notes may change as more work is recorded."), "student note is the calm one");
      }
      if (scene === "student" || scene === "student-window") check(!/gini|band|index/i.test(m.text), "no Gini, band or index on a student screen");
      if (scene === "footer") {
        check(m.text.includes("Work outside GitHub and FairTraze Docs, such as meetings, research, design and offline work, is not counted."), "footer line carries the outside-work sentence");
        const foot = await page.locator("p", { hasText: "May be wrong" }).last().boundingBox();
        check(!!foot && foot.x >= 0 && foot.x + foot.width <= width + 0.5, `footer line stays inside the screen (${Math.round(foot?.width ?? 0)}px wide, wraps)`);
      }
      if (shots) {
        const file = `earlydata__${scene}-${level}__${name}.png`;
        await page.screenshot({ path: path.join(shots, file), fullPage: !dialog });
        saved.push(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (saved.length) console.log(`\nScreenshots:\n${saved.map((f) => `  ${f}`).join("\n")}`);
console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
