import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Native confirm() cannot be styled, ignores the app theme and reads differently per browser: use ui/ConfirmDialog.
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

it("no window.confirm / window.alert in app code", () => {
  const hits = walk(SRC).flatMap((f) =>
    fs.readFileSync(f, "utf8").split(/\r?\n/).map((l, i) => (/\bwindow\.(confirm|alert)\(/.test(l) ? `${path.relative(SRC, f)}:${i + 1}` : ""))
  ).filter(Boolean);
  expect(hits).toEqual([]);
});
