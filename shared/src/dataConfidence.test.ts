import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DATA_CONFIDENCE_DAYS, dataConfidence, isDeadlinePassed, mostActiveMemberDays, showsEarlyDataTag } from "./dataConfidence";

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

describe("deadline rule: precedence", () => {
  it("no activity beats the deadline (the 'Not enough activity yet' state keeps its words)", () => {
    expect(dataConfidence({ activeDays: 0, noActivity: true, deadlinePassed: true })).toBeNull();
  });

  it("a passed deadline beats low, medium and approximate Docs data: the data is final", () => {
    expect(dataConfidence({ activeDays: 1, deadlinePassed: true })).toBe("final");
    expect(dataConfidence({ activeDays: 8, deadlinePassed: true })).toBe("final");
    expect(dataConfidence({ activeDays: 40, docsApproximate: true, deadlinePassed: true })).toBe("final");
  });

  it("no deadline, or one that has not passed, keeps today's behaviour", () => {
    expect(dataConfidence({ activeDays: 1 })).toBe("low");
    expect(dataConfidence({ activeDays: 1, deadlinePassed: false })).toBe("low");
    expect(dataConfidence({ activeDays: 8, deadlinePassed: false })).toBe("medium");
    expect(dataConfidence({ activeDays: 40, docsApproximate: true, deadlinePassed: false })).toBe("low");
  });

  it("'final' shows no tag", () => {
    expect(showsEarlyDataTag("final")).toBe(false);
  });
});

describe("isDeadlinePassed: a project due on a date is passed only after that date ends in Manila time", () => {
  // The date picker stores midnight at the START of the due date in the browser's zone. A Manila browser sends
  // 2026-11-09T16:00:00Z for "Nov 10"; a UTC browser sends 2026-11-10T00:00:00Z. Both are Nov 10 in Manila.
  const manilaMidnightNov10 = "2026-11-09T16:00:00.000Z";
  const utcMidnightNov10 = "2026-11-10T00:00:00.000Z";
  const NOV10_ENDS = "2026-11-10T16:00:00.000Z"; // 00:00 on Nov 11 in Manila

  for (const [label, stored] of [["Manila browser", manilaMidnightNov10], ["UTC browser", utcMidnightNov10]] as const) {
    it(`${label}: not passed at the start of the due date, nor at 23:59:59.999 on it; passed the instant it ends`, () => {
      expect(isDeadlinePassed(stored, new Date("2026-11-09T16:00:00.000Z"))).toBe(false);
      expect(isDeadlinePassed(stored, new Date("2026-11-10T04:00:00.000Z"))).toBe(false);
      expect(isDeadlinePassed(stored, new Date("2026-11-10T15:59:59.999Z"))).toBe(false);
      expect(isDeadlinePassed(stored, new Date(NOV10_ENDS))).toBe(true);
      expect(isDeadlinePassed(stored, new Date("2026-11-12T00:00:00.000Z"))).toBe(true);
    });
  }

  it("works with a Date, an ISO string or a timestamp, and the days before are never passed", () => {
    expect(isDeadlinePassed(new Date(manilaMidnightNov10), new Date(NOV10_ENDS))).toBe(true);
    expect(isDeadlinePassed(Date.parse(manilaMidnightNov10), Date.parse(NOV10_ENDS))).toBe(true);
    expect(isDeadlinePassed(manilaMidnightNov10, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });

  it("no deadline or an unreadable one is never passed", () => {
    expect(isDeadlinePassed(null)).toBe(false);
    expect(isDeadlinePassed(undefined)).toBe(false);
    expect(isDeadlinePassed("not a date", new Date(NOV10_ENDS))).toBe(false);
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
