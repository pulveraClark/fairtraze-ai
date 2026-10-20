import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Pale grey text fails the 4.5:1 rule (CLAUDE.md "Readability rules"). slate-400 on white is 2.56:1, so it must not be used for text.
// Decorative icons may stay lighter: a line that opens an <svg> is exempt. Dark surfaces (PaginationBar's `dark` branch) are listed explicitly.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PALE_TEXT = /\b(?:text|placeholder)-(?:slate|gray|zinc|neutral|stone)-(?:300|400)\b|\bplaceholder:text-(?:slate|gray|zinc)-(?:300|400)\b/;
const ALLOWED = [
  // Dark surfaces (slate-900 sidebar, user menu, notification popover, dark pagination): light grey text is correct there.
  { file: "components/PaginationBar.tsx", contains: "slate-", why: "dark variant and disabled button" },
  { file: "components/layout/navStyles.ts", contains: "text-slate-300", why: "dark sidebar" },
  { file: "components/layout/Sidebar.tsx", contains: "text-slate-300", why: "dark sidebar" },
  { file: "components/UserMenu.tsx", contains: "text-slate-300", why: "dark header menu" },
  { file: "components/AlertsBell.tsx", contains: "text-slate-", why: "dark notification popover" },
  { file: "hooks/useAlerts.ts", contains: "text-slate-300", why: "dark-theme alert colours (a light variant sits beside each)" },
  // Disabled controls are exempt from contrast.
  { file: "components/DocumentEditorToolbar.tsx", contains: "cursor-not-allowed", why: "disabled control" },
  { file: "components/InfoTooltip.tsx", contains: "text-slate-300", why: "file is deleted in a later commit" },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe("secondary text contrast", () => {
  it("no pale grey text classes (text-slate-400 and lighter) outside the allowlist", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, "/");
      fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (!PALE_TEXT.test(line) || line.includes("<svg")) return;
        if (ALLOWED.some((a) => a.file === rel && line.includes(a.contains))) return;
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders, `Use text-slate-600 (or var(--brand-text-faint)) for secondary text:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the shared secondary text token is at least 4.5:1 on white and slate-50", () => {
    const css = fs.readFileSync(path.join(SRC, "index.css"), "utf8");
    const hex = /--brand-text-faint:\s*(#[0-9a-f]{6})/i.exec(css)?.[1];
    expect(hex).toBeTruthy();
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    expect(ratio(hex!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex!, "#f8fafc")).toBeGreaterThanOrEqual(4.5);
  });
});
