import { describe, it, expect } from "vitest";
import type { StoredReportResponse } from "@shared/types";
import { equalSharePct, evidenceDtoFromStored, sharePct, weightPct } from "./evidenceFromStored";

// Expected values are what server/src/lib/evidenceReport.ts produces for the same inputs
// (`Math.round(share * 1000) / 10`, `Math.round(1000 / n) / 10`, `Math.round(w * 100)`), pinned as literals.
describe("instructor percentages equal the server's", () => {
  it.each([
    [0.1125, 11.3], // 11.25% rounds up
    [0.0005, 0.1],  // 0.05% rounds up
    [0.9995, 100],  // 99.95% rounds up to 100
    [0.3335, 33.4], // 33.35% rounds up
    [1, 100],
    [0.0495, 5],
    [0.125, 12.5],
    [0, 0],
  ])("share %s -> %s", (share, expected) => {
    expect(sharePct(share)).toBe(expected);
  });

  it.each([[1, 100], [3, 33.3], [6, 16.7], [7, 14.3], [9, 11.1], [15, 6.7], [16, 6.3], [0, 0]])(
    "equal share for %s members -> %s",
    (n, expected) => expect(equalSharePct(n)).toBe(expected),
  );

  it.each([[0.5, 50], [0.4, 40], [0.6, 60], [0.335, 34], [0.333, 33]])("weight %s -> %s", (w, expected) => {
    expect(weightPct(w)).toBe(expected);
  });
});

function stored(over: Partial<StoredReportResponse> = {}, members: unknown[] = []): StoredReportResponse {
  return {
    groupName: "Group 1",
    repoUrl: "https://github.com/acme/app",
    analyzedAt: "2026-10-27T03:00:00Z",
    sourceType: "COMBINED",
    evidenceReportId: null,
    scoringConfig: { blend: { wGitHub: 0.4, wDocs: 0.6 } },
    report: { members, memberCount: members.length, gini: 0.1, teamHealth: "Healthy" },
    ...over,
  } as unknown as StoredReportResponse;
}

describe("evidenceDtoFromStored", () => {
  const combined = {
    studentName: "Ana", flags: ["overload"], contributionShare: 0.3335,
    githubContributionShare: 0.1125, documentContributionShare: 0.9995,
  };

  it("maps a COMBINED member with the server's rounding and the stored blend", () => {
    const dto = evidenceDtoFromStored(stored({}, [combined, { ...combined, studentName: "Ben", flags: [] }, { ...combined, studentName: "Cai", flags: [] }]));
    expect(dto.members[0]).toEqual({ name: "Ana", githubPct: 11.3, docsPct: 100, combinedPct: 33.4, flags: ["overload"] });
    expect(dto.equalSharePct).toBe(33.3);
    expect(dto.memberCount).toBe(3);
    expect(dto.weights).toEqual({ githubPct: 40, docsPct: 60 });
  });

  it("GitHub-only and Editor-only: one source column, no weights", () => {
    const gh = evidenceDtoFromStored(stored({ sourceType: "GITHUB" }, [{ studentName: "Ana", flags: [], contributionShare: 0.5 }]));
    expect(gh.members[0]).toEqual({ name: "Ana", githubPct: 50, docsPct: null, combinedPct: 50, flags: [] });
    expect(gh.weights).toBeNull();
    const ed = evidenceDtoFromStored(stored({ sourceType: "EDITOR" }, [{ studentName: "Ana", flags: [], contributionShare: 1 }]));
    expect(ed.members[0]).toEqual({ name: "Ana", githubPct: null, docsPct: 100, combinedPct: 100, flags: [] });
    expect(ed.repoUrl).toBeNull();
  });

  it("does not invent a weight, a college, a leader or a Report ID", () => {
    const dto = evidenceDtoFromStored(stored({ scoringConfig: null }, [combined]));
    expect(dto.weights).toBeNull();
    expect(dto.collegeName).toBe("");
    expect(dto.leaderName).toBeNull();
    expect(dto.reportId).toBe("");
  });

  it("takes class and project names from the summary entry", () => {
    const dto = evidenceDtoFromStored(stored({}, [combined]), { classCode: "CC-1", classSubjectName: "Apps", assignmentTitle: "Capstone" });
    expect(dto.className).toBe("CC-1 · Apps");
    expect(dto.projectTitle).toBe("Capstone");
  });
});
