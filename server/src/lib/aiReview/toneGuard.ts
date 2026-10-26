// Checks an AI-written member summary before it is stored. Small counts ("fixed two form errors",
// "changed 14 files") are fine. Judging words, percentages, shares, scores, flags and comparisons
// between members are not: the math scores, the AI only describes work.

export interface ToneResult {
  ok: boolean;
  reasons: string[];
}

const JUDGING_WORDS = [
  "good", "great", "excellent", "outstanding", "impressive", "amazing", "nice", "well", "best", "better",
  "poor", "poorly", "bad", "badly", "worse", "worst", "weak", "lazy", "sloppy", "messy", "clean", "neat",
  "correct", "correctly", "incorrect", "incorrectly", "proper", "properly", "wrong",
  "successful", "successfully", "failed", "failure", "struggled", "unfortunately",
  "quality", "minimal", "substantial", "significant", "significantly", "major", "heavy", "heavily",
  "only", "just", "merely", "barely", "hardly", "mostly", "mainly",
  "should", "must", "needs to", "ought",
];

const WORD_RES = JUDGING_WORDS.map((w) => ({ w, re: new RegExp(`\\b${w.replace(" ", "\\s+")}\\b`, "i") }));

const RULES: Array<{ reason: string; re: RegExp }> = [
  { reason: "percentage", re: /\d\s*%|\bper\s*cent\b|\bpercent(?:age)?\b/i },
  { reason: "score or share", re: /\b(?:scores?|shares?|gini|contribution|team\s+health|rating|rank(?:ed|ing)?)\b/i },
  { reason: "flag", re: /\b(?:flags?|flagged|free-?rider|overload(?:ed)?|inactive|deadline-?driven)\b/i },
  { reason: "comparison", re: /\b(?:more|less|fewer|greater|higher|lower)\s+than\b|\bcompared\s+(?:to|with)\b|\b(?:most|least|fewest)\b|\bthan\s+(?:the\s+)?(?:others?|teammates?|peers?)\b/i },
  { reason: "other members", re: /\bMember\s+[A-Z]{1,2}\b|\b(?:other|another)\s+(?:members?|students?)\b|\bteammates?\b|\beveryone\b|\bthe\s+(?:rest|team)\b/i },
];

export function checkTone(text: string): ToneResult {
  const reasons: string[] = [];
  for (const { w, re } of WORD_RES) if (re.test(text)) reasons.push(`judging word: ${w}`);
  for (const { reason, re } of RULES) if (re.test(text)) reasons.push(reason);
  return { ok: reasons.length === 0, reasons };
}
