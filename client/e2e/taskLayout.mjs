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

// "From the project instructions" suggestions (leader only). The mock mirrors the server: a task created with a
// requirementKey removes that item from the next board payload; a member's board has none.
const SUGGESTIONS = [
  { key: "k1", text: "Has a login page that lets students sign in with their university email address" },
  { key: "k2", text: "Has a survey" },
  { key: "k3", text: "Exports the results to a PDF file" },
  { key: "k4", text: "Shows a progress chart for each team member" },
  { key: "k5", text: "Sends an email reminder before the deadline" },
  { key: "k6", text: "Has a help page" },
  { key: "k7", text: "Works on a phone" },
];

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
  for (const [name, width, height, dsf] of [["phone-375", 375, 800, 1], ["zoom-200", 640, 480, 2]].filter(([n]) => !process.env.E2E_ONLY || n === process.env.E2E_ONLY)) {
    console.log(`\n== ${name} (${width}x${height}, device scale ${dsf})`);
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    const errors = [];
    let mode = "leader"; // leader | member | instructor
    const used = new Set();
    const liveBoard = () => {
      if (mode === "leader") return { ...board, suggestions: SUGGESTIONS.filter((x) => !used.has(x.key)) };
      if (mode === "member") return { ...board, viewer: { ...board.viewer, userId: 2, isLeader: false, canManageBoard: false } };
      return { ...board, viewer: { ...board.viewer, userId: 99, isLeader: false, isMember: false, readOnly: true, canCreate: false, canManageBoard: false } };
    };
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => localStorage.setItem("ft_auth_token", "t"));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/api/auth/me") return json({ id: 1, email: "l@x.com", name: "Leader Lee", systemRole: "STUDENT" });
      if (url.pathname === "/api/groups/7/tasks" && route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        if (body.requirementKey) used.add(body.requirementKey);
        return json(task(50, { title: body.title, description: body.description ?? null }), 201);
      }
      if (url.pathname === "/api/groups/7/tasks") return json(liveBoard());
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

    // ── New task: Title combobox ("From the project instructions") ────────────────────────────────
    const waitBoard = () => page.getByRole("button", { name: /Write the introduction/ }).first().waitFor();
    const openNewTask = async () => {
      await page.getByRole("button", { name: "New task" }).click();
      const d = page.getByRole("dialog", { name: "New task" });
      await d.waitFor();
      return d;
    };
    const insideViewport = (b) => b.x >= -0.5 && b.x + b.width <= width + 0.5 && b.y >= -0.5 && b.y + b.height <= height + 0.5;
    const hasRing = (e) => { const s = getComputedStyle(e); return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (!!s.boxShadow && s.boxShadow !== "none"); };
    const listboxes = () => page.getByRole("listbox").count();
    const dialogs = () => page.getByRole("dialog", { name: "New task" }).count();
    const tb = page.locator("#nt-title");
    const chevron = page.getByRole("button", { name: "Show project instructions" });

    let nd = await openNewTask();
    check((await tb.getAttribute("role")) === "combobox", "title: is a combobox for the leader");
    check(await tb.evaluate((e) => document.activeElement === e), "title: autofocused");
    check((await tb.getAttribute("aria-expanded")) === "false" && (await listboxes()) === 0, "title: list is closed on the dialog's first focus");
    check(await chevron.isVisible(), "title: chevron is visible");

    await tb.click();
    check((await listboxes()) === 1, "opens on click");
    await page.keyboard.press("Escape");
    check((await listboxes()) === 0 && (await dialogs()) === 1, "first Esc closes only the list");
    await chevron.click();
    check((await listboxes()) === 1, "opens on the chevron");
    await chevron.click();
    check((await listboxes()) === 0, "chevron closes it again");
    await tb.focus();
    check((await listboxes()) === 0, "focus alone does not open it");
    await page.keyboard.press("ArrowDown");
    check((await listboxes()) === 1, "opens on ArrowDown");
    await page.keyboard.press("Escape");
    await page.keyboard.type("s");
    check((await listboxes()) === 1, "opens on typing");
    await tb.fill("");
    await page.keyboard.press("Escape");

    // Geometry with the full list (7 items; about 5 rows show, the rest scroll inside).
    await tb.click();
    const lb = page.getByRole("listbox");
    await lb.waitFor();
    const lbox = await lb.boundingBox();
    check(insideViewport(lbox), `list inside the viewport (${Math.round(lbox.x)},${Math.round(lbox.y)} ${Math.round(lbox.width)}x${Math.round(lbox.height)} in ${width}x${height})`);
    const clip = await page.evaluate(() => {
      const list = document.querySelector("[role=listbox]");
      const l = list.getBoundingClientRect();
      const bad = [];
      for (let el = list.parentElement; el && el !== document.body; el = el.parentElement) {
        const s = getComputedStyle(el);
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
          const r = el.getBoundingClientRect();
          if (l.bottom > r.bottom + 0.5 || l.right > r.right + 0.5 || l.left < r.left - 0.5 || l.top < r.top - 0.5) bad.push(el.getAttribute("role") || el.tagName.toLowerCase());
        }
      }
      return bad;
    });
    check(clip.length === 0, `list not clipped by the dialog's scroll area ${clip.join(",")}`);
    const o2 = await page.evaluate(pageOverflow);
    check(o2.sw <= o2.cw, `new task: no sideways page scroll (${o2.sw} <= ${o2.cw})`);
    check(await page.getByRole("dialog", { name: "New task" }).evaluate((d) => d.scrollWidth <= d.clientWidth + 1), "new task: dialog has no sideways scroll");
    const rows = await page.getByRole("listbox").getByRole("option").evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) })));
    check(rows.length === SUGGESTIONS.length && rows.every((r) => r.h >= 43.5), `rows are at least 44px (min ${Math.round(Math.min(...rows.map((r) => r.h)))}px of ${rows.length})`);
    check(rows.every((r) => r.fs >= 14), `row text is at least 14px (${Math.min(...rows.map((r) => r.fs))}px)`);
    check(lbox.height <= 5 * 44 + 1, `list shows at most about 5 rows (${Math.round(lbox.height)}px)`);
    check(await lb.evaluate((e) => e.scrollHeight > e.clientHeight), "list scrolls inside when longer than 5 rows");
    check(await tb.evaluate(hasRing), "title field shows a focus ring");
    check(await chevron.evaluate((e) => { e.focus(); const st = getComputedStyle(e); return (st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0) || (!!st.boxShadow && st.boxShadow !== "none"); }), "chevron shows a focus ring when focused");
    if (shots) await page.screenshot({ path: path.join(shots, `${name}-newtask-list.png`) });
    await tb.focus();

    // Filter, pick, and what the pick fills in.
    await tb.fill("");
    await page.keyboard.type("survey");
    check((await page.getByRole("listbox").getByRole("option").count()) === 1, "filters as you type");
    await page.keyboard.type(" zzz");
    check((await listboxes()) === 0 && (await tb.inputValue()) === "survey zzz", "no match closes the list and keeps the typed title");
    await tb.fill("");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    check((await tb.inputValue()) === SUGGESTIONS[1].text, `Enter picks: title = requirement text ("${await tb.inputValue()}")`);
    const desc = await page.locator("#nt-desc").inputValue();
    check(desc === "From the project instructions.", `description = "From the project instructions." (got "${desc}")`);
    check((await listboxes()) === 0, "list closes after picking");

    // Esc keeps the typed text; a second Esc closes the dialog.
    await tb.fill("");
    await page.keyboard.type("Ha");
    check((await listboxes()) === 1, "list is open before Esc");
    await page.keyboard.press("Escape");
    check((await listboxes()) === 0 && (await tb.inputValue()) === "Ha" && (await dialogs()) === 1, "Esc closes the list and keeps the typed text");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "New task" }).waitFor({ state: "detached" });
    check(true, "second Esc closes the dialog");

    // Create from a suggestion, reopen: that item is gone from the list.
    nd = await openNewTask();
    await tb.click();
    await page.getByRole("listbox").getByRole("option", { name: SUGGESTIONS[2].text }).click();
    await page.getByRole("button", { name: "Create task" }).click();
    await nd.waitFor({ state: "detached" });
    await page.waitForTimeout(300);
    await openNewTask();
    await tb.click();
    const texts = await page.getByRole("listbox").getByRole("option").allTextContents();
    check(!texts.includes(SUGGESTIONS[2].text) && texts.length === SUGGESTIONS.length - 1, `an item that already has a task is not in the list (${texts.length} left of ${SUGGESTIONS.length})`);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");

    // A member sees a plain text box. An instructor cannot create tasks at all (view only), so has no Title field.
    mode = "member";
    await page.reload();
    await waitBoard();
    await openNewTask();
    check((await tb.getAttribute("role")) === null && (await chevron.count()) === 0, "member: plain text box, no chevron");
    await tb.click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.type("x");
    check((await listboxes()) === 0, "member: no list opens");
    await page.keyboard.press("Escape");
    mode = "instructor";
    await page.reload();
    await waitBoard();
    check((await page.getByRole("button", { name: "New task" }).count()) === 0, "instructor: no New task button, so no Title field at all");
    mode = "leader";
    await page.reload();
    await waitBoard();

    // Another dialog's Esc still closes it (the useFocusTrap change only yields to an open combobox).
    await page.getByRole("button", { name: "Workload" }).click();
    await page.getByRole("dialog", { name: "Workload" }).waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Workload" }).waitFor({ state: "detached" });
    check(true, "other dialog (Workload): Esc still closes it normally");

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
