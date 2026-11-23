import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// jsdom has no layout, so this checks the rules that give the sizes; real pixel sizes are measured by ux-audit/designcheck.mjs.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => fs.readFileSync(path.join(SRC, f), "utf8");

describe("tap targets", () => {
  const css = read("index.css");

  it(".ft-hit is at least 32px, and 40px on coarse pointers", () => {
    expect(/\.ft-hit\s*\{[^}]*min-width:\s*2rem;[^}]*min-height:\s*2rem/s.test(css)).toBe(true);
    const coarse = /@media \(pointer: coarse\)\s*\{([\s\S]*)\}\s*$/.exec(css)?.[1] ?? "";
    expect(coarse).toMatch(/\.ft-hit\s*\{\s*min-width:\s*2\.5rem;\s*min-height:\s*2\.5rem/);
    expect(coarse).toMatch(/\.ft-app-content :where\(button/);
  });

  it("the coarse rule leaves the document, calendar chips and landing page alone", () => {
    expect(css).toMatch(/:not\(\.ft-doc-content \*, \.ft-legacy-scale \*, \[data-no-coarse\]\)/);
  });

  it("the coarse rule is only inside the pointer media query (desktop heights unchanged)", () => {
    const outside = css.replace(/@media \(pointer: coarse\)\s*\{[\s\S]*\}\s*$/, "");
    expect(outside).not.toMatch(/where\(button/);
  });

  it.each([
    ["pages/ClassPage.tsx", "Copy class join code"],
    ["pages/ClassPage.tsx", "Show QR code"],
    ["pages/StudentClassPage.tsx", "Leave class"],
    ["pages/StudentPage.tsx", "Copy class join code"],
    ["components/AppFooter.tsx", "How FairTraze works"],
    ["components/GroupManageModal.tsx", "Rename group"],
    ["pages/StudentGroupPage.tsx", "Rename group"],
    ["pages/AlertsPage.tsx", "Refresh"],
    ["pages/DisputesPage.tsx", "View group report"],
    ["pages/StudentGroupPage.tsx", "See all your notes"],
    ["pages/StudentGroupPage.tsx", "Open Tasks tab"],
    ["components/StudentNoteCard.tsx", "{groupName}</button>"],
  ])("%s: %s carries ft-hit", (file, label) => {
    const lines = read(file).split(/\r?\n/);
    const hits = lines.map((l, i) => (l.includes(label) ? i : -1)).filter((i) => i >= 0);
    expect(hits.length).toBeGreaterThan(0);
    // some occurrence of the label sits inside a button that carries ft-hit (the class is on the opening tag, a few lines up or down)
    const ok = hits.some((at) => lines.slice(Math.max(0, at - 6), at + 5).join(" ").includes("ft-hit"));
    expect(ok).toBe(true);
  });
});
