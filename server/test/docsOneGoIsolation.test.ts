import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCORING_RULES_VERSION } from "@shared/scoringRules.js";

// The "added in one go" hint is an instructor-only pointer. It must not reach scoring, the AI, the
// analysis, the stored report or any student-facing route.
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(here, rel), "utf8");
const PATTERN = /oneGo|OneGo|docsOneGo/;

describe("one-go hint isolation", () => {
  it("scoring rules version is unchanged", () => {
    expect(SCORING_RULES_VERSION).toBe(3);
  });

  it.each([
    "../../shared/src/scoring.ts", "../../shared/src/documentScoring.ts", "../../shared/src/combinedScoring.ts",
    "../../shared/src/editClassifier.ts", "../../shared/src/scoringRules.ts", "../../shared/src/weights.ts",
    "../../shared/src/imageCredit.ts", "../../shared/src/dataConfidence.ts",
    "../src/lib/gemini.ts", "../src/lib/scoringConfig.ts", "../src/lib/analysisRunner.ts", "../src/routes/analyze.ts",
    "../src/lib/autoAnalysis.ts", "../src/lib/resultsChange.ts", "../src/lib/alerts.ts",
    "../src/routes/join.ts", "../src/routes/evidenceReport.ts", "../src/lib/evidenceReport.ts", "../src/routes/privacy.ts",
    "../src/routes/aiReview.ts", "../src/collab/editStats.ts", "../src/collab/editReplay.ts", "../src/collab/authorshipCapture.ts",
  ])("%s never mentions the hint", (rel) => {
    if (!fs.existsSync(path.resolve(here, rel))) return;
    expect(read(rel)).not.toMatch(PATTERN);
  });

  it("no AI review file mentions the hint", () => {
    const dir = path.resolve(here, "../src/lib/aiReview");
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".ts")) expect(fs.readFileSync(path.join(dir, f), "utf8"), f).not.toMatch(PATTERN);
    }
  });

  it("only the instructor report route reads the hint helper", () => {
    const routes = path.resolve(here, "../src/routes");
    const users = fs.readdirSync(routes).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && /docsOneGoHint/.test(fs.readFileSync(path.join(routes, f), "utf8")));
    expect(users).toEqual(["projects.ts"]);
  });

  it("the helper imports no scoring or AI code", () => {
    const imports = read("../src/lib/docsOneGoHint.ts").split("\n").filter((l) => /^import\b/.test(l)).join("\n");
    expect(imports).not.toMatch(/gemini|aiReview|computeTeamReport|documentScoring|combinedScoring|scoring\.js/);
  });
});
