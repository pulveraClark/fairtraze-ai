/**
 * The instructor's AI explanation as the group LEADER may read it: the same text, minus any sentence that states the
 * Gini value (the student side never shows it). Display only; the stored text and every score are untouched.
 */
export function studentNarrative(text: string | null | undefined): string | null {
  if (!text) return null;
  const kept = text
    .split(/\n{2,}/)
    .map((para) => para.split(/(?<=[.!?])\s+/).filter((s) => !/\bgini\b/i.test(s)).join(" ").trim())
    .filter((para) => para.length > 0);
  return kept.length > 0 ? kept.join("\n\n") : null;
}
