import { describe, it, expect } from "vitest";
import type { ProjectSummaryItem } from "@shared/types";
import { computeAssignmentBenchmark } from "./benchmark";

let idCounter = 0;

function item(overrides: Partial<ProjectSummaryItem> = {}): ProjectSummaryItem {
  idCounter += 1;
  return {
    projectId: idCounter,
    groupName: `Group ${idCounter}`,
    assignmentLabel: "CC-TEST — Test Subject",
    classId: 1,
    assignmentId: 10,
    sourceType: "GITHUB",
    memberCount: 3,
    teamHealth: "Healthy",
    gini: 0.2,
    memberShares: [],
    flagsPresent: [],
    lastAnalyzedAt: "2026-01-01T00:00:00.000Z",
    isAnalyzed: true,
    membershipChangedAt: null,
    scoringConfigChangedAt: null,
    ...overrides,
  };
}

describe("computeAssignmentBenchmark", () => {
  it("omits the comparison when there are no other groups under the assignment", () => {
    const self = item({ assignmentId: 10, gini: 0.3 });
    const result = computeAssignmentBenchmark([self], 10, { excludeProjectId: self.projectId });
    expect(result).toEqual({ averageGini: null, analyzedPeerCount: 0 });
  });

  it("omits the comparison when assignmentId is null (assignment-less legacy project)", () => {
    const items = [item({ assignmentId: null, gini: 0.1 }), item({ assignmentId: null, gini: 0.5 })];
    const result = computeAssignmentBenchmark(items, null);
    expect(result).toEqual({ averageGini: null, analyzedPeerCount: 0 });
  });

  it("filters out unanalyzed peers (isAnalyzed: false) before averaging", () => {
    const items = [
      item({ assignmentId: 10, gini: 0.4, isAnalyzed: true }),
      item({ assignmentId: 10, gini: null, isAnalyzed: false }),
      item({ assignmentId: 10, gini: null, isAnalyzed: false }),
    ];
    const result = computeAssignmentBenchmark(items, 10);
    expect(result.analyzedPeerCount).toBe(1);
    expect(result.averageGini).toBeCloseTo(0.4);
  });

  it("omits the comparison when peers exist but none have been analyzed yet", () => {
    const items = [
      item({ assignmentId: 10, gini: null, isAnalyzed: false }),
      item({ assignmentId: 10, gini: null, isAnalyzed: false }),
    ];
    const result = computeAssignmentBenchmark(items, 10);
    expect(result).toEqual({ averageGini: null, analyzedPeerCount: 0 });
  });

  it("excludes the given projectId when excludeProjectId is passed (self-exclusion)", () => {
    const self = item({ assignmentId: 10, gini: 0.9 });
    const peerA = item({ assignmentId: 10, gini: 0.1 });
    const peerB = item({ assignmentId: 10, gini: 0.3 });
    const result = computeAssignmentBenchmark([self, peerA, peerB], 10, {
      excludeProjectId: self.projectId,
    });
    expect(result.analyzedPeerCount).toBe(2);
    expect(result.averageGini).toBeCloseTo(0.2); // (0.1 + 0.3) / 2, self's 0.9 excluded
  });

  it("includes every analyzed group when excludeProjectId is omitted (self-inclusion / page-level stat)", () => {
    const items = [
      item({ assignmentId: 10, gini: 0.9 }),
      item({ assignmentId: 10, gini: 0.1 }),
      item({ assignmentId: 10, gini: 0.3 }),
    ];
    const result = computeAssignmentBenchmark(items, 10);
    expect(result.analyzedPeerCount).toBe(3);
    expect(result.averageGini).toBeCloseTo((0.9 + 0.1 + 0.3) / 3);
  });

  it("never mixes in projects from a different assignmentId", () => {
    const items = [
      item({ assignmentId: 10, gini: 0.2 }),
      item({ assignmentId: 10, gini: 0.4 }),
      item({ assignmentId: 99, gini: 0.9 }), // different assignment — must not affect assignment 10's average
    ];
    const result = computeAssignmentBenchmark(items, 10);
    expect(result.analyzedPeerCount).toBe(2);
    expect(result.averageGini).toBeCloseTo(0.3);
  });
});
