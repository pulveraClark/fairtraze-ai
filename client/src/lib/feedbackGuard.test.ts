import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guard for Batch B (feedback everywhere).
 *
 * 1. Every hook (and any file using useMutation) that SENDS data must also give feedback to the
 *    user (a success toast, an error toast, or useAction), or be listed in FEEDBACK_ALLOWLIST with a
 *    reason. A new mutation hook with neither fails this test.
 * 2. Every allowlist entry needs a real reason, an existing file, and must still send data (so a stale
 *    entry is removed instead of silently excusing a future change).
 * 3. Text passed to toast and useAction calls follows the wording rules: no exclamation marks, and
 *    never the words free-rider, Gini, band(s) or team health.
 *
 * Page and component level fetches are covered by their own feature tests, not by this scan.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Path under client/src -> why this file may send data without a toast of its own. */
export const FEEDBACK_ALLOWLIST: Record<string, string> = {
  "hooks/useGenerateAiReport.ts":
    "The AI explanation appears in place and the Narrative card shows its own Generating..., slow and error lines with a Try again button.",
  "hooks/useAiReview.ts":
    "The AI review appears in place and the findings card shows its own status, warning and error lines; a toast would repeat them.",
};

// --- detection -------------------------------------------------------------------------------

/** Removes // and block comments so an example in a doc comment does not count as code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

const SENDS_DATA = [
  /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
  /\buseMutation\s*\(/,
  /\.mutate\s*\(/,
  /\btaskApi\.(?:create|update|move|bulk|remove|add|reorder|upload|edit|watch|delete|sync|change)\w*\s*\(/,
];

const GIVES_FEEDBACK = [
  /\bshowSuccessToast\b/,
  /\bshowToast\b/,
  /\bshowError\b/,
  /\buseAction\s*\(/,
  /\bonToast\b/,
];

export function sendsData(source: string): boolean {
  const code = stripComments(source);
  return SENDS_DATA.some((re) => re.test(code));
}

export function givesFeedback(source: string): boolean {
  const code = stripComments(source);
  return GIVES_FEEDBACK.some((re) => re.test(code));
}

/** Pure check used by the scan and by the self-tests below. */
export function missingFeedback(relPath: string, source: string, allowlist: Record<string, string> = FEEDBACK_ALLOWLIST): boolean {
  return sendsData(source) && !givesFeedback(source) && !(relPath in allowlist);
}

// --- file walking ----------------------------------------------------------------------------

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");
const read = (file: string) => fs.readFileSync(file, "utf8");

/** Hooks, plus any file that uses react-query's useMutation (those hold the mutation outside hooks/). */
function scannedFiles(): string[] {
  const all = walk(SRC);
  return all.filter((f) => rel(f).startsWith("hooks/") || /\buseMutation\s*\(/.test(stripComments(read(f))));
}

// --- the tests -------------------------------------------------------------------------------

describe("feedback guard: mutation hooks", () => {
  it("scans the hooks folder and finds the known mutation hooks", () => {
    const files = scannedFiles().map(rel);
    expect(files).toEqual(expect.arrayContaining(["hooks/useTaskActions.ts", "hooks/useTaskDetails.ts", "hooks/useAction.ts"]));
    expect(files).toEqual(expect.arrayContaining(["components/DeletionRequests.tsx", "components/InstructorApprovals.tsx"]));
  });

  it("every file that sends data gives feedback, or is allowlisted with a reason", () => {
    const offenders = scannedFiles()
      .filter((f) => missingFeedback(rel(f), read(f)))
      .map(rel);
    expect(
      offenders,
      `These files send data but call no toast or useAction. Add a success/error toast (see lib/feedback.ts) or add the file to FEEDBACK_ALLOWLIST in this test with a reason:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowlist entry has a real reason, exists, and still sends data", () => {
    for (const [file, reason] of Object.entries(FEEDBACK_ALLOWLIST)) {
      const full = path.join(SRC, file);
      expect(fs.existsSync(full), `${file} does not exist; remove its allowlist entry`).toBe(true);
      expect(reason.trim().length, `${file} needs a reason`).toBeGreaterThanOrEqual(25);
      expect(sendsData(read(full)), `${file} no longer sends data; remove its allowlist entry`).toBe(true);
    }
  });
});

describe("feedback guard: the detector itself", () => {
  const hook = (body: string) => `import { x } from "y";\nexport function useThing() {\n${body}\n}\n`;

  it("flags a new hook that sends data and gives no feedback", () => {
    const src = hook('  return () => fetch("/api/x", { method: "POST" });');
    expect(missingFeedback("hooks/useNew.ts", src)).toBe(true);
  });

  it("flags useMutation and taskApi writes without feedback", () => {
    expect(missingFeedback("hooks/useA.ts", hook("  useMutation({ mutationFn });"))).toBe(true);
    expect(missingFeedback("hooks/useB.ts", hook("  taskApi.update(t, 1, {});"))).toBe(true);
    expect(missingFeedback("hooks/useC.ts", hook("  review.mutate({ id: 1 });"))).toBe(true);
  });

  it("accepts a hook with a success toast, an error toast, or useAction", () => {
    const post = 'fetch("/api/x", { method: "PATCH" });';
    expect(missingFeedback("hooks/useD.ts", hook(`  ${post} showSuccessToast("Saved.");`))).toBe(false);
    expect(missingFeedback("hooks/useE.ts", hook(`  ${post} showError("Could not save. Try again.");`))).toBe(false);
    expect(missingFeedback("hooks/useF.ts", hook(`  const { run } = useAction(); ${post}`))).toBe(false);
  });

  it("accepts an allowlisted file and ignores code that only appears in comments or reads data", () => {
    const post = hook('  return fetch("/api/x", { method: "DELETE" });');
    expect(missingFeedback("hooks/useG.ts", post, { "hooks/useG.ts": "Shown in place by its own card." })).toBe(false);
    expect(missingFeedback("hooks/useH.ts", hook('  // fetch("/api/x", { method: "POST" })\n  return 1;'))).toBe(false);
    expect(missingFeedback("hooks/useI.ts", hook('  return fetch("/api/x");'))).toBe(false);
  });
});

// --- wording rules ---------------------------------------------------------------------------

const BANNED = /free-?rider|gini|team health|\bbands?\b/i;

/** The text handed to toast and useAction calls. Template literals are read as written. */
function feedbackStrings(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  const quote = String.raw`(["'\x60])((?:\\.|(?!\1)[^\\\n])*)\1`;
  const patterns = [
    new RegExp(String.raw`\b(?:showSuccessToast|showError)\(\s*` + quote, "g"),
    new RegExp(String.raw`\bonToast\??\.?\(\s*["'](?:success|error)["']\s*,\s*` + quote, "g"),
    new RegExp(String.raw`\bshowToast\(\s*\{[^}]*?\bmessage:\s*` + quote, "g"),
    new RegExp(String.raw`\b(?:success|error):\s*` + quote, "g"),
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) out.push(m[2] ?? "");
  }
  return out;
}

describe("feedback guard: wording", () => {
  it("collects the strings it is supposed to check", () => {
    const sample = `showSuccessToast("Saved."); showError('Could not save. Try again.');
      run(fn, { success: "Request accepted.", error: "Could not accept the request. Try again." });
      onToast?.("success", "Instructor approved."); showToast({ message: "Moved it.", tone: "error" });`;
    expect(feedbackStrings(sample)).toEqual(
      expect.arrayContaining(["Saved.", "Could not save. Try again.", "Request accepted.", "Could not accept the request. Try again.", "Instructor approved.", "Moved it."]),
    );
  });

  it("no toast or useAction text has an exclamation mark or the words free-rider, Gini, band or team health", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const file of walk(SRC)) {
      for (const text of feedbackStrings(read(file))) {
        checked += 1;
        if (text.includes("!") || BANNED.test(text)) problems.push(`${rel(file)}: "${text}"`);
      }
    }
    // The scan must really be reading the app's messages, not passing because it found nothing.
    expect(checked, "the wording scan found too few feedback strings; its patterns may have broken").toBeGreaterThan(60);
    expect(problems, `Feedback wording rules (no "!", no free-rider/Gini/band/team health):\n${problems.join("\n")}`).toEqual([]);
  });

  it("the banned-word check really catches them", () => {
    expect(BANNED.test("Member flagged as a free-rider")).toBe(true);
    expect(BANNED.test("Your Gini value changed")).toBe(true);
    expect(BANNED.test("Team health updated")).toBe(true);
    expect(BANNED.test("Request accepted.")).toBe(false);
  });
});
