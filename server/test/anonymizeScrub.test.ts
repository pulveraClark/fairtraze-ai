import { describe, it, expect } from "vitest";
import { scrubReportContent, scrubIdentity } from "../src/lib/anonymizeUser.js";

// Pure string/JSON logic (no DB): the erasure rewrite of a stored Report.content.
const ID = { name: "Juan Dela Cruz", email: "juan@uclm.edu.ph", githubUsername: "jdelacruz" };

function stored() {
  return JSON.stringify({
    report: {
      gini: 0.31, teamHealth: "Moderate Risk", memberCount: 2,
      members: [
        { studentName: "Juan Dela Cruz", githubUsername: "jdelacruz", userId: 7, contributionShare: 0.7, commits: 12, flags: ["overload"],
          github: { studentName: "Juan Dela Cruz", githubUsername: "jdelacruz", commits: 12 } },
        { studentName: "Maria Santos", githubUsername: "msantos", userId: 8, contributionShare: 0.3, commits: 5, flags: [] },
      ],
    },
    narrative: "Juan Dela Cruz (jdelacruz, juan@uclm.edu.ph) carried most of the work. Maria Santos contributed steadily.",
    scoringConfig: { weightCommits: 0.4 },
  });
}

describe("scrubReportContent", () => {
  it("anonymizes only the erased member and leaves every number untouched", () => {
    const before = JSON.parse(stored());
    const after = JSON.parse(scrubReportContent(stored(), 7, ID));

    expect(after.report.members[0].studentName).toBe("Former member");
    expect(after.report.members[0].githubUsername).toBe("");
    expect(after.report.members[0].github.studentName).toBe("Former member");
    expect(after.report.members[0].userId).toBe(7);

    // Teammate unchanged, name included.
    expect(after.report.members[1]).toEqual(before.report.members[1]);

    // All numbers/flags identical.
    for (const k of ["contributionShare", "commits", "flags"] as const) {
      expect(after.report.members[0][k]).toEqual(before.report.members[0][k]);
    }
    expect(after.report.gini).toBe(before.report.gini);
    expect(after.report.teamHealth).toBe(before.report.teamHealth);
    expect(after.scoringConfig).toEqual(before.scoringConfig);
  });

  it("scrubs the erased member from the narrative but keeps teammates' names", () => {
    const after = JSON.parse(scrubReportContent(stored(), 7, ID));
    expect(after.narrative).not.toContain("Juan");
    expect(after.narrative).not.toContain("jdelacruz");
    expect(after.narrative).not.toContain("juan@uclm.edu.ph");
    expect(after.narrative).toContain("Maria Santos contributed steadily");
    expect(after.narrative).toContain("Former member");
  });

  it("matches a GITHUB-only entry (no userId) by GitHub username", () => {
    const content = JSON.stringify({ report: { members: [{ studentName: "Juan Dela Cruz", githubUsername: "JDelaCruz", commits: 3 }] }, narrative: null });
    const after = JSON.parse(scrubReportContent(content, 7, ID));
    expect(after.report.members[0]).toMatchObject({ studentName: "Former member", githubUsername: "", commits: 3 });
  });

  it("returns malformed content unchanged", () => {
    expect(scrubReportContent("not json", 7, ID)).toBe("not json");
  });
});

describe("scrubIdentity", () => {
  it("does not mangle ordinary words for a very short username", () => {
    const out = scrubIdentity("A member made a change", { name: "Ann", email: "a@x.ph", githubUsername: "a" });
    expect(out).toBe("A member made a change");
  });
});
