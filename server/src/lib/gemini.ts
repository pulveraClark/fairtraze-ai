import { GoogleGenAI } from "@google/genai";
import type { TeamReport } from "@shared/types.js";

const SYSTEM_INSTRUCTION = `You are an assistant helping an instructor assess team contribution fairness in a software project.
Write an evidence-based contribution fairness report using only the statistics provided — never change the numbers, never assign grades, never speculate beyond what the data shows.

Structure your response exactly as follows:
1. One sentence introducing the project and its overall team health.
2. One short paragraph per team member who has at least one flag. For each flagged member, cite their specific commits, churn (additions + deletions), contributionShare, and state which flag fired and precisely why (reference the threshold that triggered it).
3. One sentence summarising the team Gini coefficient and what it means in plain language.
4. One closing sentence reminding the instructor that this report supports but does not replace their own judgment.

Tone: fair, factual, non-accusatory. Do not use words like "lazy", "cheating", or "unfair". Do not add headers or bullet points — write in flowing prose.`;

export async function generateFairnessNarrative(
  projectName: string,
  teamReport: TeamReport,
  apiKey: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Project: ${projectName}\n\nTeam Report:\n${JSON.stringify(teamReport, null, 2)}`,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  return response.text ?? "";
}
