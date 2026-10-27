import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamReport, AnyScoredMember } from "@shared/types.js";

// Prompt text only: no DB, no real Gemini. The SDK is mocked to capture what would be sent, and the real
// gemini.ts is loaded (setupEnv.ts mocks it globally), as in geminiPseudonymization.test.ts.
const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", INTEGER: "INTEGER" },
}));
process.env.GEMINI_API_KEY ||= "test-gemini-key";

const { generateFairnessNarrative } = await vi.importActual<typeof import("../src/lib/gemini.js")>("../src/lib/gemini.js");
const { PLAIN_ENGLISH_RULES, NARRATIVE_PLAIN_ENGLISH_EXTRA } = await import("../src/lib/plainEnglish.js");
const {
  AI_REVIEW_PROMPT_VERSION, BRIEF_PROMPT_VERSION, COMMIT_PROMPT_VERSION, BRIEF_SYSTEM, COMMIT_SYSTEM, ROLLUP_SYSTEM,
} = await import("../src/lib/aiReview/prompts.js");

const member = {
  studentName: "Ana Cruz", githubUsername: "anacruz", contributionShare: 0.6, commits: 9, activeDays: 4, additions: 100, deletions: 5, flags: [],
} as unknown as AnyScoredMember;
const report = { members: [member], memberCount: 1, gini: 0.1, teamHealth: "Healthy" } as unknown as TeamReport<AnyScoredMember>;

describe("plain-English rules in the prompts", () => {
  beforeEach(() => { generateContent.mockReset(); generateContent.mockResolvedValue({ text: "Fine." }); });

  it("the rules ask for short sentences, plain words, exact words where needed, and verbatim quotes", () => {
    expect(PLAIN_ENGLISH_RULES).toMatch(/about 15 words or fewer/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/Never go past 25 words/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/active voice/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/Say what was done first/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/Explain a technical term once/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/do not use the words commit, repository or code/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/keep the exact word/);
    expect(PLAIN_ENGLISH_RULES).toMatch(/Copy quotes, file names and section headings word for word/);
    expect(NARRATIVE_PLAIN_ENGLISH_EXTRA).toMatch(/Gini coefficient/);
    expect(NARRATIVE_PLAIN_ENGLISH_EXTRA).toMatch(/how evenly the work is shared/);
  });

  it("the member findings and the project instructions check carry the rules; the commit sentences do not change", () => {
    expect(ROLLUP_SYSTEM).toContain(PLAIN_ENGLISH_RULES);
    expect(BRIEF_SYSTEM).toContain(PLAIN_ENGLISH_RULES);
    expect(COMMIT_SYSTEM).not.toContain("PLAIN ENGLISH");
  });

  it("the score explanation prompt carries the rules and the Gini line", async () => {
    await generateFairnessNarrative("Group 1", report, null);
    const system = generateContent.mock.calls[0]![0].config.systemInstruction as string;
    expect(system).toContain(PLAIN_ENGLISH_RULES);
    expect(system).toContain(NARRATIVE_PLAIN_ENGLISH_EXTRA);
  });

  it("the score explanation no longer closes with the 'supports but does not replace your judgment' sentence", async () => {
    await generateFairnessNarrative("Group 1", report, null);
    const system = generateContent.mock.calls[0]![0].config.systemInstruction as string;
    expect(system).not.toMatch(/remind the instructor|does not replace their own judgment/i);
    expect(system).not.toMatch(/^4\. /m);
    // The other steps are still there.
    expect(system).toMatch(/^1\. One sentence: state the project name/m);
    expect(system).toMatch(/^3\. One sentence: state the Gini coefficient/m);
  });

  it("the tone guard and verbatim rules are untouched", () => {
    expect(ROLLUP_SYSTEM).toMatch(/do not mention percentages, scores, shares, flags or rankings/);
    expect(ROLLUP_SYSTEM).toMatch(/do not compare anyone with anyone else, and do not name people/);
    expect(BRIEF_SYSTEM).toMatch(/copied exactly from that file's excerpt/);
    expect(BRIEF_SYSTEM).toMatch(/copied word for word/);
    expect(BRIEF_SYSTEM).toMatch(/copied or lightly shortened from the instructions, never reworded/);
    expect(BRIEF_SYSTEM).toMatch(/Do not judge quality or correctness, do not give grades or scores/);
  });

  it("versions: member findings are bumped, the commit cache and the brief prompt are not", () => {
    expect(AI_REVIEW_PROMPT_VERSION).toBe("ai-review-3");
    expect(COMMIT_PROMPT_VERSION).toBe("ai-review-2");
    expect(BRIEF_PROMPT_VERSION).toBe("brief-3");
  });
});
