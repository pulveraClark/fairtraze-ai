import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import type { TeamReport, AnyScoredMember, DocumentScoredMember, CombinedScoredMember } from "@shared/types.js";

function isCombinedMember(m: AnyScoredMember): m is CombinedScoredMember {
  return "githubContributionShare" in m;
}
function isDocumentMember(m: AnyScoredMember): m is DocumentScoredMember {
  return "sessionCount" in m;
}

// Validate at startup — fail clearly rather than silently at call time
if (!process.env.GEMINI_API_KEY) {
  throw new Error(
    "[STARTUP] GEMINI_API_KEY is not set.\n" +
    "Add GEMINI_API_KEY=<your key> to server/.env and restart.\n" +
    "Get a key at https://aistudio.google.com (sign in → Get API key)."
  );
}

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `You are an assistant helping an instructor review team contribution fairness in a software project.
Your sole job is to translate pre-computed statistics into plain language. The numbers, flags, and team-health label have already been determined by a deterministic scoring system. You describe them — you do not recompute, verify, or override them.

═══ HARD RULES — never break any of these ═══

FLAGS ARE THE SINGLE SOURCE OF TRUTH
• Every member's "Flags:" line is authoritative. It contains the complete, final list of participation flags the system assigned.
• If "Flags:" says "none" → the member has NO flags. Do NOT mention any flag for them, do not imply concern about their numbers, and do not suggest a flag should have fired.
• If "Flags:" lists one or more flags → mention ONLY those exact flags (e.g. "overload", "free-rider", "inactive", "deadline-driven"). Do NOT add, remove, or rename flags.
• NEVER look at the numbers and decide independently whether a member should be flagged. The system already made that determination. Your job is only to describe what "Flags:" says.

NO THRESHOLDS, NO MATH
• Never state, reference, estimate, or imply any threshold value (e.g. do not write "exceeded 0.5", "above 1.75×", "below the threshold"). You do not know the thresholds.
• Do not perform or describe any computation or comparison. Simply report what is given.

NO CONTRADICTIONS
• If teamHealth is "Healthy" and every member's flags are "none", the narrative must say so — describe it as a well-distributed team and do not express any concern or reservation about any individual.
• The narrative must be consistent with teamHealth, the Gini value, and every member's flags field exactly as provided.

═══ Structure — write in flowing prose, no headers, no bullet points ═══

1. One sentence: state the project name and the exact teamHealth label given.
2. For each member whose "Flags:" is NOT "none": one short paragraph naming the member, citing their contributionShare (%), commits, and the flag(s) listed. Describe what each flag means in plain language — do NOT explain why it triggered or reference any threshold.
3. One sentence: state the Gini coefficient value and describe in plain language what it means for how evenly contribution is spread.
4. One sentence: remind the instructor that this report supports but does not replace their own judgment.

If no member has any flags, omit step 2 entirely.
Tone: fair, factual, non-accusatory. Never use words like "lazy", "cheating", or "unfair".`;

// Build a readable plain-text representation of the team report.
// Using explicit "Flags: none" (not an empty array) is the key guard against the model
// misreading [] and inventing flags from the contribution numbers.
// Branches per member shape (GitHub / Docs / Combined) so each source's own signals are
// described accurately — a Docs or Combined member has no .commits/.additions/.deletions,
// and reading those unconditionally would render as "undefined"/"NaN" in the prompt.
function formatPrompt(projectName: string, teamReport: TeamReport<AnyScoredMember>): string {
  const equalShare = (100 / teamReport.memberCount).toFixed(1);
  const memberLines = teamReport.members
    .map((m) => {
      const flagsText = m.flags.length > 0 ? m.flags.join(", ") : "none";
      const shareLine = `  Contribution share: ${(m.contributionShare * 100).toFixed(1)}% (equal share for this team: ${equalShare}%)`;

      if (isCombinedMember(m)) {
        return [
          `Member: ${m.studentName} (GitHub: ${m.githubUsername})`,
          shareLine,
          `  GitHub share: ${(m.githubContributionShare * 100).toFixed(1)}% (weight ${Math.round(m.wGitHub * 100)}%) | Docs share: ${(m.documentContributionShare * 100).toFixed(1)}% (weight ${Math.round(m.wDocs * 100)}%)`,
          `  Commits: ${m.github?.commits ?? 0} | Docs sessions: ${m.document?.sessionCount ?? 0}`,
          `  Flags: ${flagsText}`,
        ].join("\n");
      }
      if (isDocumentMember(m)) {
        return [
          `Member: ${m.studentName}`,
          shareLine,
          `  Edit sessions: ${m.sessionCount} | Active days: ${m.activeDays} | Churn: ${m.churn.toLocaleString()} characters`,
          `  Flags: ${flagsText}`,
        ].join("\n");
      }
      const churn = m.additions + m.deletions;
      return [
        `Member: ${m.studentName} (GitHub: ${m.githubUsername})`,
        shareLine,
        `  Commits: ${m.commits} | Active days: ${m.activeDays} | Churn: ${churn.toLocaleString()} lines`,
        `  Flags: ${flagsText}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Project: ${projectName}`,
    `Team health: ${teamReport.teamHealth}`,
    `Gini coefficient: ${teamReport.gini.toFixed(3)}`,
    `Team size: ${teamReport.memberCount} members (equal share = ${equalShare}% each)`,
    ``,
    `MEMBER DATA:`,
    memberLines,
  ].join("\n");
}

async function callOnce(projectName: string, teamReport: TeamReport<AnyScoredMember>): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: formatPrompt(projectName, teamReport),
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });
  return response.text ?? "";
}

export async function generateFairnessNarrative(
  projectName: string,
  teamReport: TeamReport<AnyScoredMember>
): Promise<string> {
  try {
    return await callOnce(projectName, teamReport);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) {
      // Respect retry delay from error message if present, otherwise wait 5 s
      const match = (e.message ?? "").match(/(\d+)\s*s/i);
      const delayMs = match ? parseInt(match[1], 10) * 1000 : 5000;
      console.warn(`[Gemini] Rate-limited. Retrying in ${delayMs / 1000}s…`);
      await new Promise((r) => setTimeout(r, delayMs));
      return callOnce(projectName, teamReport); // single retry, then propagate
    }
    throw err;
  }
}
