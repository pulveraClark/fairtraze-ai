import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AI review (member summaries, brief check) is a read-only aid. It must never feed a score, a flag,
// the Gini value, team health or the narrative prompt, and the analysis must never write to it.
//
// The one exception is shared plumbing: gemini.ts (the narrative) borrows call counting and quota
// errors from the AI provider client, because the narrative and the AI review spend the same daily
// quota. Those two import lines are allowed in gemini.ts and nowhere else. They carry no AI review
// content, and a quota refusal can only stop the narrative text; scores, flags, Gini and team
// health are computed before Gemini is called.

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(here, rel), "utf8");

const FORBIDDEN = /aiReview|AiReportReview|AiCommitDigest|aiReviewEnabled|geminiClient|aiReviewTypes/;

// The only two lines gemini.ts may use to reach the shared client / daily quota.
const GEMINI_ALLOWED_IMPORTS = [
  'import { AiReviewError, reserveProviderCall } from "./geminiClient.js";',
  'import { noteDailyQuotaHit } from "./aiReview/limiter.js";',
];

/** Source text with exactly the allowed import lines removed (line endings ignored). */
function withoutAllowedImports(src: string, allowed: string[]): string {
  return src
    .split(/\r?\n/)
    .filter((line) => !allowed.includes(line.trim()))
    .join("\n");
}

/** Every module specifier in an `import ... from "x"` or side-effect `import "x"` line. */
function importSpecifiers(src: string): string[] {
  return [...src.matchAll(/^\s*import\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)].map((m) => m[1]!);
}

describe("static: scoring, the analyzer and the narrative do not touch AI review", () => {
  const FILES = [
    "../../shared/src/scoring.ts", "../../shared/src/documentScoring.ts", "../../shared/src/combinedScoring.ts",
    "../../shared/src/commitClassifier.ts", "../../shared/src/lineClassifier.ts", "../../shared/src/fileWeights.ts",
    "../../shared/src/editClassifier.ts", "../src/lib/geminiPseudonyms.ts",
    "../src/lib/scoringConfig.ts", "../src/lib/analysisRunner.ts", "../src/lib/github.ts", "../src/lib/resultsChange.ts",
  ];
  it.each(FILES)("%s never mentions AI review", (rel) => {
    expect(read(rel)).not.toMatch(FORBIDDEN);
  });

  it("../src/lib/gemini.ts only borrows call counting and quota errors, never AI review content", () => {
    const src = read("../src/lib/gemini.ts");
    // Both allowed imports must really be there (an exact line each), so this stays an allow-list of two.
    for (const line of GEMINI_ALLOWED_IMPORTS) {
      expect(src.split(/\r?\n/).map((l) => l.trim())).toContain(line);
    }
    // Everything else in the file is held to the same rule as the other 12 files.
    expect(withoutAllowedImports(src, GEMINI_ALLOWED_IMPORTS)).not.toMatch(FORBIDDEN);
  });

  it("the files gemini.ts borrows from import no AI review content module", () => {
    const reviewDir = path.resolve(here, "../src/lib/aiReview");
    const contentModules = fs.readdirSync(reviewDir)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "limiter.ts")
      .map((n) => n.replace(/\.ts$/, ""));
    expect(contentModules.length).toBeGreaterThan(0);

    // gemini.ts: its only geminiClient / aiReview imports are the two allowed ones.
    const geminiImports = importSpecifiers(read("../src/lib/gemini.ts"));
    expect(geminiImports.filter((s) => /geminiClient|aiReview/.test(s)).sort())
      .toEqual(["./aiReview/limiter.js", "./geminiClient.js"]);
    for (const m of contentModules) expect(geminiImports.join("\n")).not.toContain(`aiReview/${m}`);

    // geminiClient.ts and aiReview/limiter.ts: plumbing only, no database, no scoring, no review content.
    const clientImports = importSpecifiers(read("../src/lib/geminiClient.ts"));
    expect(clientImports.sort()).toEqual(["./aiQuota.js", "./aiReview/limiter.js", "@google/genai", "dotenv/config"]);
    expect(importSpecifiers(read("../src/lib/aiReview/limiter.ts"))).toEqual([]);
  });

  it("the narrative route does not read or write AI review rows", () => {
    expect(read("../src/routes/analyze.ts")).not.toMatch(/aiReportReview|aiCommitDigest|generateMemberSummaries/);
  });

  it("the AI review code never writes Report.content or any score table", () => {
    const dir = path.resolve(here, "../src/lib/aiReview");
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/prisma\.report\.(update|create|upsert|delete)|\.report\.update\(/);
      expect(src, f).not.toMatch(/documentContribution|combinedContribution/i);
      expect(src, f).not.toMatch(/@shared\/(scoring|documentScoring|combinedScoring)/);
    }
  });
});
