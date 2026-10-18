// Local-only: the Tasks tab at 375px and at 200% zoom (a 1280px desktop zoomed to 200% is a 640px CSS viewport).
// Checks no sideways page scroll, nothing wider than its dialog, text size, visible focus and target size.
// Mocked API, no backend, no database. Run: node e2e/taskLayout.mjs [screenshot-dir]
// Included in `npm run test:e2e -w client`.
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] ?? null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const PORT = 5201;
const server = await createServer({ root: path.resolve(here, ".."), server: { port: PORT, strictPort: true }, logLevel: "error" });
await server.listen();

const members = [
  { userId: 1, name: "Leader Lee", avatarUpdatedAt: null, role: "LEADER", functionalRoles: ["DEVELOPER"] },
  { userId: 2, name: "Ben Cruz", avatarUpdatedAt: null, role: "MEMBER", functionalRoles: ["DEVELOPER"] },
  { userId: 3, name: "Ana Reyes", avatarUpdatedAt: null, role: "MEMBER", functionalRoles: ["DOCUMENTATION"] },
];
const perms = { edit: true, setDue: true, assign: true, delete: true, move: true, comment: true, watch: true, allowedStatuses: ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] };
const today = new Date().toISOString().slice(0, 10);
const plus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const task = (id, over = {}) => ({
  id, projectId: 7, key: `FT-${id}`, number: id, title: `Task ${id}`, description: null, assignedToUserId: null, createdByUserId: 1,
  done: false, completedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", status: "TODO",
  priority: "MEDIUM", dueDate: null, position: id * 1024, version: 1, milestoneId: null, docHeading: null, labelIds: [],
  subtasks: { done: 1, total: 3 }, commitCount: 2, permissions: perms, ...over,
});
const board = {
  group: { id: 7, groupName: "Group Alpha", taskKey: "FT", deadline: new Date(Date.now() + 30 * 86400000).toISOString(), hasRepo: true, commitsRefreshedAt: new Date(Date.now() - 180000).toISOString(), keyAliases: ["GA"] },
  viewer: { userId: 1, isLeader: true, isMember: true, readOnly: false, canCreate: true, canManageBoard: true },
  members,
  tasks: [
    task(1, { title: "Write the introduction chapter for the final report", assignedToUserId: 3, priority: "HIGH", dueDate: plus(-2), milestoneId: 5, labelIds: [10], docHeading: "Introduction" }),
    task(2, { title: "Set up continuous integration", status: "IN_PROGRESS", assignedToUserId: 2, dueDate: plus(3) }),
    task(3, { title: "Review the database schema", status: "IN_REVIEW", assignedToUserId: 2 }),
    task(4, { title: "Deploy the first build", status: "DONE", assignedToUserId: 1 }),
  ],
  milestones: [{ id: 5, name: "Alpha release", dueDate: plus(14), position: 1, total: 2, done: 1 }],
  labels: [{ id: 10, name: "Documentation", color: "violet" }],
};
const details = {
  taskId: 1,
  subtasks: [{ id: 1, title: "Outline the sections", done: true, position: 1 }, { id: 2, title: "Draft the problem statement", done: false, position: 2 }],
  attachments: [{ id: 1, kind: "PDF", mime: "application/pdf", filename: "requirements-with-a-very-long-file-name-v2-final.pdf", size: 482113, createdByUserId: 3, createdAt: "2026-10-12T02:00:00.000Z" }],
  storage: { usedBytes: 482113, limitBytes: 50 * 1024 * 1024 },
  comments: [{ id: 1, authorId: 3, body: "I can take this, <@1> can you confirm the https://example.com/a/very/long/link/that/should/wrap/instead/of/overflowing ?", createdAt: "2026-10-14T03:00:00.000Z", editedAt: null }],
  watchers: [1, 3], watching: true,
  activity: [{ id: 1, actorId: 1, type: "created", data: null, createdAt: "2026-10-12T02:40:00.000Z" }],
  commits: [{ sha: "a41f9c2d0000", shortSha: "a41f9c2", message: "FT-1: add the introduction chapter with a rather long commit message line", authorLogin: "ana-dev", committedAt: "2026-10-15T02:40:00.000Z", url: "https://github.com/acme/app/commit/a41f9c2d0000" }],
};
const workload = {
  groupId: 7, today,
  members: [{ userId: 2, name: "Ben Cruz", open: 4, overdue: 2, dueThisWeek: 1, inReview: 1, done: 3 }, { userId: 3, name: "Ana Reyes", open: 1, overdue: 0, dueThisWeek: 0, inReview: 0, done: 2 }, { userId: 1, name: "Leader Lee", open: 0, overdue: 0, dueThisWeek: 0, inReview: 0, done: 1 }],
  unassigned: { open: 2, overdue: 1 },
};

const browser = await chromium.launch();
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) failures++; };

// Wide enough elements only count when they are really part of the page (not inside a scroll box of their own).
const pageOverflow = () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth });

async function textSizes(page, rootSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    return [...root.querySelectorAll("*")]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest("svg"))
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; })
      .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12)
      .map((e) => `${e.tagName.toLowerCase()}: ${e.textContent.trim().slice(0, 30)} (${getComputedStyle(e).fontSize})`);
  }, rootSelector);
}

async function smallTargets(page, rootSelector) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const controls = [...root.querySelectorAll('button, select, input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), textarea, [role=tab], [role=radio]')];
    return controls
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.disabled; })
      // Inline text links and underlined text buttons sit inside a sentence; they are not stand-alone targets.
      .filter((e) => !/\bunderline\b/.test(e.className))
      // Calendar chips are dense by design: 24px is the WCAG 2.2 minimum target size; everything else is 32px or more.
      .filter((e) => e.getBoundingClientRect().height < (e.hasAttribute("data-task-open") && e.closest("[role=grid], table, [aria-label*=alendar]") ? 23.5 : 31.5))
      .map((e) => `${e.tagName.toLowerCase()}: ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)} (${Math.round(e.getBoundingClientRect().height)}px)`);
  }, rootSelector);
}

async function focusRings(page, count) {
  const bad = [];
  let previous = null;
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < count; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(60); // let a focus transition settle before reading the style
    const info = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const s = getComputedStyle(e);
      const ring = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      return { ring, label: `${e.tagName.toLowerCase()}: ${(e.getAttribute("aria-label") || e.textContent || e.id || "").trim().slice(0, 30)} [outline ${s.outlineStyle} ${s.outlineWidth}, shadow ${String(s.boxShadow).slice(0, 20)}, focus-visible ${e.matches(":focus-visible")}]`, visible: e.getBoundingClientRect().width > 0 };
    });
    // A native date field keeps focus while Tab walks its month/day/year parts (the browser draws its own
    // highlight there and reports the host as not focus-visible), so only its first stop is checked.
    const sameElement = info && previous === info.label.split(" [")[0];
    previous = info ? info.label.split(" [")[0] : null;
    if (info && info.visible && !info.ring && !sameElement) bad.push(info.label);
  }
  return bad;
}

try {
  for (const [name, width, height, dsf] of [["phone-375", 375, 800, 1], ["zoom-200", 640, 480, 2]]) {
    console.log(`\n== ${name} (${width}x${height}, device scale ${dsf})`);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem("ft_auth_token", "t"));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/auth/me") return json({ id: 1, email: "l@x.com", name: "Leader Lee", systemRole: "STUDENT" });
      if (url.pathname === "/api/groups/7/tasks") return json(board);
      if (url.pathname === "/api/groups/7/tasks/workload") return json(workload);
      if (/^\/api\/groups\/7\/tasks\/\d+\/details$/.test(url.pathname)) return json({ ...details, taskId: Number(url.pathname.split("/")[5]) });
      if (url.pathname === "/api/groups/7/document/headings") return json({ headings: [{ level: 1, text: "Introduction" }] });
      return json({ error: "not mocked" }, 404);
    });
    await page.goto(`http://localhost:${PORT}/e2e/taskLayout.html`);
    await page.getByRole("button", { name: /Write the introduction/ }).first().waitFor();
    await page.waitForTimeout(300);

    // Board, List, Calendar: the PAGE never scrolls sideways (the board scrolls inside its own box).
    for (const view of ["Board", "List", "Calendar"]) {
      await page.getByRole("radio", { name: view }).click();
      await page.waitForTimeout(250);
      const o = await page.evaluate(pageOverflow);
      check(o.sw <= o.cw, `${view}: no sideways page scroll (${o.sw} <= ${o.cw})`);
      const tiny = await textSizes(page, "main");
      check(tiny.length === 0, `${view}: no text under 12px ${tiny.slice(0, 3).join(" | ")}`);
      const small = await smallTargets(page, "main");
      check(small.length === 0, `${view}: controls at least 32px tall ${small.slice(0, 4).join(" | ")}`);
      if (shots) await page.screenshot({ path: path.join(shots, `${name}-${view.toLowerCase()}.png`), fullPage: false });
    }
    await page.getByRole("radio", { name: "Board" }).click();

    // Commit bar and the key dialog.
    check(await page.getByRole("button", { name: "Refresh commits" }).isVisible(), "commit bar: Refresh commits is reachable");
    await page.getByRole("button", { name: /Task key: FT/ }).click();
    const kd = page.getByRole("dialog", { name: "Change task key" });
    await kd.waitFor();
    let box = await kd.boundingBox();
    check(box.x >= 0 && box.x + box.width <= width + 0.5, `key dialog fits the width (${Math.round(box.x)}..${Math.round(box.x + box.width)} of ${width})`);
    await page.keyboard.press("Escape");

    // Workload panel.
    await page.getByRole("button", { name: "Workload" }).click();
    const wd = page.getByRole("dialog", { name: "Workload" });
    await wd.waitFor();
    await page.getByRole("table").waitFor();
    box = await wd.boundingBox();
    check(box.x >= 0 && box.x + box.width <= width + 0.5, `workload dialog fits the width (${Math.round(box.width)} <= ${width})`);
    const wtiny = await textSizes(page, "[role=dialog]");
    check(wtiny.length === 0, `workload: no text under 12px ${wtiny.slice(0, 3).join(" | ")}`);
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-workload.png`) });
    await page.keyboard.press("Escape");

    // Task details window.
    await page.getByRole("button", { name: /Write the introduction/ }).first().click();
    const dlg = page.getByRole("dialog", { name: "FT-1" });
    await dlg.waitFor();
    await page.getByText("Outline the sections").waitFor();
    await page.getByText("a41f9c2").waitFor();
    await page.waitForTimeout(300);
    box = await dlg.boundingBox();
    check(box.x >= -0.5 && box.x + box.width <= width + 0.5 && box.y >= -0.5 && box.y + box.height <= height + 0.5, `task window inside the viewport (${Math.round(box.width)}x${Math.round(box.height)} in ${width}x${height})`);
    const over = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      const right = d.getBoundingClientRect().right;
      return [...d.querySelectorAll("*")].filter((e) => !e.closest("svg") && e.getBoundingClientRect().right > right + 1 && getComputedStyle(e).position !== "absolute").length;
    });
    check(over === 0, `task window: nothing runs past its right edge (${over})`);
    const dtiny = await textSizes(page, "[role=dialog]");
    check(dtiny.length === 0, `task window: no text under 12px ${dtiny.slice(0, 3).join(" | ")}`);
    const dsmall = await smallTargets(page, "[role=dialog]");
    check(dsmall.length === 0, `task window: controls at least 32px tall ${dsmall.slice(0, 4).join(" | ")}`);
    const noRing = await focusRings(page, 30);
    check(noRing.length === 0, `task window: every control shows a focus ring ${noRing.slice(0, 4).join(" | ")}`);
    const inside = await page.evaluate(() => document.querySelector("[role=dialog]").contains(document.activeElement));
    check(inside, "task window: Tab stays inside the window");
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-details.png`) });
    await page.keyboard.press("Escape");

    if (errors.length) console.log(`  console errors:`, errors.slice(0, 4));
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
