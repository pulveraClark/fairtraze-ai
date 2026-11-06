import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DATA_CONFIDENCE_DAYS, dataConfidence, mostActiveMemberDays, showsEarlyDataTag } from "./dataConfidence";

describe("dataConfidence", () => {
  it("the thresholds are one named constant", () => {
    expect(DATA_CONFIDENCE_DAYS).toEqual({ low: 5, high: 15 });
  });

  it("low under 5 days, medium 5 to 14, high 15 or more", () => {
    expect(dataConfidence({ activeDays: 0 })).toBe("low");
    expect(dataConfidence({ activeDays: 4 })).toBe("low");
    expect(dataConfidence({ activeDays: 5 })).toBe("medium");
    expect(dataConfidence({ activeDays: 14 })).toBe("medium");
    expect(dataConfidence({ activeDays: 15 })).toBe("high");
    expect(dataConfidence({ activeDays: 90 })).toBe("high");
  });

  it("approximate Docs data forces low even when there are many days", () => {
    expect(dataConfidence({ activeDays: 40, docsApproximate: true })).toBe("low");
    expect(dataConfidence({ activeDays: 40, docsApproximate: false })).toBe("high");
  });

  it("all-zero activity has no level at all (the 'Not enough activity yet' state covers it)", () => {
    expect(dataConfidence({ activeDays: 0, noActivity: true })).toBeNull();
    expect(dataConfidence({ activeDays: 40, docsApproximate: true, noActivity: true })).toBeNull();
  });

  it("only low and medium show a tag", () => {
    expect(showsEarlyDataTag("low")).toBe(true);
    expect(showsEarlyDataTag("medium")).toBe(true);
    expect(showsEarlyDataTag("high")).toBe(false);
    expect(showsEarlyDataTag(null)).toBe(false);
    expect(showsEarlyDataTag(undefined)).toBe(false);
  });

  it("uses the most active member's days, across GitHub, Docs and Combined shapes", () => {
    expect(mostActiveMemberDays([{ activeDays: 3 }, { activeDays: 9 }, { activeDays: 1 }])).toBe(9);
    expect(mostActiveMemberDays([{ github: { activeDays: 4 }, document: { activeDays: 11 } }, { github: null, document: { activeDays: 2 } }])).toBe(11);
    expect(mostActiveMemberDays([])).toBe(0);
    expect(mostActiveMemberDays([{ activeDays: null }, { github: null, document: null }])).toBe(0);
  });

  it("never changes anything it is given (pure)", () => {
    const members = [{ activeDays: 3, github: { activeDays: 4 } }];
    const copy = JSON.stringify(members);
    mostActiveMemberDays(members);
    expect(JSON.stringify(members)).toBe(copy);
  });
});

describe("display only: scoring files never import it", () => {
  const dir = __dirname;
  const SCORING = readdirSync(dir).filter((f) => /^(scoring|documentScoring|combinedScoring|scoringRules|lineClassifier|commitClassifier|editClassifier|fileWeights|analysisDay)\.ts$/.test(f));
  it("finds the scoring files", () => expect(SCORING.length).toBeGreaterThanOrEqual(6));
  for (const f of SCORING) {
    it(`${f} does not mention dataConfidence`, () => {
      expect(readFileSync(path.join(dir, f), "utf8")).not.toMatch(/dataConfidence|DATA_CONFIDENCE/);
    });
  }
});
