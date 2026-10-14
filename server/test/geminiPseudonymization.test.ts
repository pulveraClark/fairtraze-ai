import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamReport, AnyScoredMember } from "@shared/types.js";

// No DB: this file only exercises prompt construction. The SDK is mocked to capture exactly what
// would be sent to Google, and the real gemini.ts is loaded (setupEnv.ts mocks it globally).
const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
process.env.GEMINI_API_KEY ||= "test-gemini-key";

const { generateFairnessNarrative } = await vi.importActual<typeof import("../src/lib/gemini.js")>(
  "../src/lib/gemini.js",
);

const REAL = [
  { name: "Juan Dela Cruz",  login: "jdelacruz-dev", email: "juan.delacruz@uclm.edu.ph" },
  { name: "Maria Santos",    login: "msantos2004",   email: "maria.santos@uclm.edu.ph" },
  { name: "Pedro Reyes",     login: "pedroreyes",    email: "pedro.reyes@uclm.edu.ph" },
];

function githubMember(i: number, flags: string[] = []) {
  return {
    studentName: REAL[i]!.name, githubUsername: REAL[i]!.login, contributionShare: [0.6, 0.3, 0.1][i]!,
    commits: 10 - i, activeDays: 5 - i, additions: 100, deletions: 20, flags,
  } as unknown as AnyScoredMember;
}
function docMember(i: number) {
  return {
    studentName: REAL[i]!.name, userId: 100 + i, contributionShare: [0.6, 0.3, 0.1][i]!,
    sessionCount: 4, activeDays: 3, churn: 500, flags: [],
  } as unknown as AnyScoredMember;
}
function combinedMember(i: number) {
  return {
    studentName: REAL[i]!.name, githubUsername: REAL[i]!.login, userId: 100 + i,
    contributionShare: [0.6, 0.3, 0.1][i]!, githubContributionShare: 0.5, documentContributionShare: 0.5,
    wGitHub: 0.5, wDocs: 0.5, github: { commits: 7 }, document: { sessionCount: 3 }, flags: ["free-rider"],
  } as unknown as AnyScoredMember;
}
function report(members: AnyScoredMember[]): TeamReport<AnyScoredMember> {
  return { members, memberCount: members.length, gini: 0.31, teamHealth: "Moderate Risk" } as unknown as TeamReport<AnyScoredMember>;
}

function sentPrompt(): string {
  const arg = generateContent.mock.calls.at(-1)![0] as { contents: string; config: { systemInstruction: string } };
  return `${arg.contents}\n${arg.config.systemInstruction}`;
}

beforeEach(() => {
  generateContent.mockReset();
});

describe("Gemini data minimization", () => {
  // EDITOR reports carry no GitHub username, so a username typed into free text (the brief)
  // cannot be recognised there; that case is covered for GITHUB/COMBINED only.
  it.each([
    ["GITHUB",   () => [0, 1, 2].map((i) => githubMember(i)), true],
    ["EDITOR",   () => [0, 1, 2].map(docMember),              false],
    ["COMBINED", () => [0, 1, 2].map(combinedMember),         true],
  ])("no real name, username or email leaves in the %s prompt", async (_label, build, hasLogins) => {
    generateContent.mockResolvedValue({ text: "ok" });
    await generateFairnessNarrative(
      "Group of Juan Dela Cruz",
      report(build()),
      "Contact maria.santos@uclm.edu.ph or ask Pedro Reyes about the rubric." +
        (hasLogins ? " pedroreyes and jdelacruz-dev own the repo." : ""),
    );

    const sent = sentPrompt();
    for (const p of REAL) {
      expect(sent).not.toContain(p.name);
      expect(sent).not.toContain(p.email);
      if (hasLogins) expect(sent).not.toContain(p.login);
    }
    expect(sent).toContain("Member A");
    expect(sent).toContain("Member C");
  });

  it("restores real names in the returned narrative", async () => {
    generateContent.mockResolvedValue({ text: "Member A led the work. Member B contributed less; Member C was steady." });
    const out = await generateFairnessNarrative("Group 1", report([0, 1, 2].map((i) => githubMember(i))));
    expect(out).toBe("Juan Dela Cruz led the work. Maria Santos contributed less; Pedro Reyes was steady.");
  });

  it("scores and flags in the prompt are identical to the un-pseudonymized prompt", async () => {
    generateContent.mockResolvedValue({ text: "ok" });
    const members = [githubMember(0, ["overload"]), githubMember(1), githubMember(2, ["free-rider"])];
    await generateFairnessNarrative("Group 1", report(members));
    const sent = sentPrompt();
    expect(sent).toContain("Contribution share: 60.0%");
    expect(sent).toContain("Contribution share: 30.0%");
    expect(sent).toContain("Contribution share: 10.0%");
    expect(sent).toContain("Flags: overload");
    expect(sent).toContain("Flags: free-rider");
    expect(sent).toContain("Gini coefficient: 0.310");
    expect(sent).toContain("Team health: Moderate Risk");
  });

  it("does not double-substitute when a real name looks like a pseudonym", async () => {
    generateContent.mockResolvedValue({ text: "Member A and Member B did the work." });
    const a = { ...githubMember(0), studentName: "Member B", githubUsername: "mb" } as unknown as AnyScoredMember;
    const b = { ...githubMember(1), studentName: "Member A", githubUsername: "ma" } as unknown as AnyScoredMember;
    const out = await generateFairnessNarrative("Group 1", report([a, b]));
    // Pseudonym A -> real "Member B", pseudonym B -> real "Member A": one pass, no cascading.
    expect(out).toBe("Member B and Member A did the work.");
  });

  it("handles more than 26 members with unique pseudonyms", async () => {
    generateContent.mockResolvedValue({ text: "ok" });
    const many = Array.from({ length: 28 }, (_, i) => ({
      ...githubMember(0), studentName: `Student Number ${i}`, githubUsername: `user-${i}-login`,
    })) as unknown as AnyScoredMember[];
    await generateFairnessNarrative("Group 1", report(many));
    const sent = sentPrompt();
    expect(sent).toContain("Member AA");
    expect(sent).not.toContain("Student Number");
  });
});
