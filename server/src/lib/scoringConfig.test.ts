import { describe, it, expect } from "vitest";
import {
  assignmentScoringConfig, configsEqual, scoringConfigBodySchema, validateConfigSums, DEFAULT_SCORING_CONFIG,
} from "./scoringConfig.js";

const ROW = {
  weightCommits: 0.4, weightLines: 0.4, weightActiveDays: 0.2,
  freeRiderThreshold: 0.5, overloadThreshold: 1.75, deadlineDrivenThreshold: 0.6,
  weightGithub: 0.55, weightDocs: 0.45,
  docsWeightRetainedText: 0.37, docsWeightSessions: 0.30, docsWeightActiveDays: 0.33,
};

describe("Docs weights in the scoring config", () => {
  it("defaults are the expert-survey values", () => {
    expect(DEFAULT_SCORING_CONFIG.docsWeights).toEqual({ retainedText: 0.37, sessions: 0.30, activeDays: 0.33 });
    expect(DEFAULT_SCORING_CONFIG.blend).toEqual({ wGitHub: 0.55, wDocs: 0.45 });
  });

  it("assignmentScoringConfig reads the three Docs columns", () => {
    expect(assignmentScoringConfig(ROW).docsWeights).toEqual({ retainedText: 0.37, sessions: 0.30, activeDays: 0.33 });
    expect(assignmentScoringConfig({ ...ROW, docsWeightRetainedText: 0.5, docsWeightSessions: 0.25, docsWeightActiveDays: 0.25 }).docsWeights)
      .toEqual({ retainedText: 0.5, sessions: 0.25, activeDays: 0.25 });
  });

  const body = (docsWeights?: unknown) => scoringConfigBodySchema.parse({
    weights: { commits: 0.4, lines: 0.4, activeDays: 0.2 },
    thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
    blend: { wGitHub: 0.55, wDocs: 0.45 },
    ...(docsWeights ? { docsWeights } : {}),
  });

  it("accepts Docs weights that add up to 1.00 and an older body without them", () => {
    expect(validateConfigSums(body({ retainedText: 0.5, sessions: 0.25, activeDays: 0.25 }))).toBeNull();
    expect(validateConfigSums(body())).toBeNull();
  });

  it("rejects Docs weights that do not add up, with a message that says what to fix", () => {
    expect(validateConfigSums(body({ retainedText: 0.4, sessions: 0.3, activeDays: 0.25 })))
      .toBe("Docs weights add up to 0.95. They must add up to 1.00.");
    expect(validateConfigSums(body({ retainedText: 0.5, sessions: 0.5, activeDays: 0.5 })))
      .toBe("Docs weights add up to 1.50. They must add up to 1.00.");
  });

  it("rejects a Docs value outside 0 to 1", () => {
    expect(() => body({ retainedText: 1.2, sessions: -0.1, activeDays: -0.1 })).toThrow();
  });

  it("configsEqual compares Docs weights only when asked (EDITOR / COMBINED)", () => {
    const a = assignmentScoringConfig(ROW);
    const b = { ...a, docsWeights: { retainedText: 0.5, sessions: 0.25, activeDays: 0.25 } };
    expect(configsEqual(a, b, false, false)).toBe(true);   // GITHUB: Docs weights are irrelevant
    expect(configsEqual(a, b, false, true)).toBe(false);   // EDITOR
    expect(configsEqual(a, b, true)).toBe(false);          // COMBINED
  });

  it("a snapshot saved before version 3 (no docsWeights) counts as the old 0.6/0.2/0.2", () => {
    const a = assignmentScoringConfig(ROW);
    const { docsWeights: _omit, ...old } = a;
    expect(configsEqual(old, a, false, true)).toBe(false);
    expect(configsEqual({ ...old, docsWeights: { retainedText: 0.6, sessions: 0.2, activeDays: 0.2 } }, { ...old, docsWeights: undefined }, false, true)).toBe(true);
  });
});
