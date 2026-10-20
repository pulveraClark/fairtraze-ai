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

  // Coloured text on a light surface: these shades are under 4.5:1 on white (amber/emerald/orange/teal/sky/cyan/lime 600 and lighter,
  // indigo/red/rose/violet/blue/purple 500 and lighter). Use the -700 or -800 shade of the same colour. Checked in the components
  // that carry meaning through colour: health/flag/status pills, the class cards' health counts, EDP codes and the role badge.
  it("meaning-carrying components use -700/-800 coloured text, not lighter shades", () => {
    const FAILING = /\b(?:hover:|group-hover:)?text-(?:(?:amber|emerald|green|orange|yellow|teal|sky|cyan|lime)-(?:100|200|300|400|500|600)|(?:indigo|red|rose|violet|blue|purple|fuchsia|pink)-(?:100|200|300|400|500))\b/;
    const FILES = [
      "components/ui/StatusPill.tsx", "components/FlagTag.tsx", "components/NoActivityPill.tsx",
      "components/ClassCard.tsx", "components/ClassContainerCard.tsx", "components/ClassCodeLabel.tsx",
      "pages/SettingsPage.tsx", "pages/StudentClassPage.tsx", "pages/AdminPage.tsx", "pages/ClassPage.tsx",
    ];
    const offenders: string[] = [];
    for (const rel of FILES) {
      fs.readFileSync(path.join(SRC, rel), "utf8").split(/\r?\n/).forEach((line, i) => {
        if (line.includes("<svg") || !FAILING.test(line)) return; // decorative icons may stay lighter
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders, `Use the -700/-800 shade:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("the -700/-800 text shades used for these components are at least 4.5:1 on white and on their light tint", () => {
    const lum = (h: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const shades: Record<string, string> = { "amber-800": "#92400e", "emerald-700": "#047857", "indigo-700": "#4338ca", "red-700": "#b91c1c", "slate-700": "#334155" };
    const surfaces = ["#ffffff", "#f8fafc", "#fffbeb", "#ecfdf5", "#eef2ff", "#fef2f2"]; // white, slate-50, amber-50, emerald-50, indigo-50, red-50
    for (const [name, hex] of Object.entries(shades)) for (const bg of surfaces) expect(ratio(hex, bg), `${name} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});
