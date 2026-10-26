import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// AI review (member summaries, brief check) is a read-only aid. It must never feed a score, a flag,
// the Gini value, team health or the narrative prompt, and the analysis must never write to it.

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.resolve(here, rel), "utf8");

const FORBIDDEN = /aiReview|AiReportReview|AiCommitDigest|aiReviewEnabled|geminiClient|aiReviewTypes/;

describe("static: scoring, the analyzer and the narrative do not touch AI review", () => {
  const FILES = [
    "../../shared/src/scoring.ts", "../../shared/src/documentScoring.ts", "../../shared/src/combinedScoring.ts",
    "../../shared/src/commitClassifier.ts", "../../shared/src/lineClassifier.ts", "../../shared/src/fileWeights.ts",
    "../../shared/src/editClassifier.ts", "../src/lib/gemini.ts", "../src/lib/geminiPseudonyms.ts",
    "../src/lib/scoringConfig.ts", "../src/lib/analysisRunner.ts", "../src/lib/github.ts", "../src/lib/resultsChange.ts",
  ];
  it.each(FILES)("%s never mentions AI review", (rel) => {
    expect(read(rel)).not.toMatch(FORBIDDEN);
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
