import type { DocumentScoringWeights, BlendWeights } from "./types.js";

// Default Docs weights and source blend. They follow an expert survey of instructors (AHP).
// Instructors can change them per project (Scoring settings); these are the pre-filled values.
export const DOCUMENT_DEFAULT_WEIGHTS: DocumentScoringWeights = {
  retainedText: 0.37, sessions: 0.30, activeDays: 0.33,
};
export const DEFAULT_BLEND_WEIGHTS: BlendWeights = { wGitHub: 0.55, wDocs: 0.45 };

// A group of weights is valid when every value is a finite number from 0 to 1 and the group adds up
// to 1.00 (within 0.001, the same tolerance the API uses).
export const WEIGHT_SUM_TOLERANCE = 0.001;

export function weightsAreValid(values: readonly unknown[]): boolean {
  let sum = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return false;
    sum += v;
  }
  return Math.abs(sum - 1) <= WEIGHT_SUM_TOLERANCE;
}

/**
 * Returns the given Docs weights when valid, otherwise the defaults. Never throws and never
 * rescales: an invalid set is replaced as a whole and a warning is logged (no personal data).
 */
export function resolveDocumentWeights(w: DocumentScoringWeights | null | undefined): DocumentScoringWeights {
  if (w == null) return DOCUMENT_DEFAULT_WEIGHTS;
  if (weightsAreValid([w.retainedText, w.sessions, w.activeDays])) return w;
  console.warn("[scoring] Invalid Docs weights; using the defaults instead.");
  return DOCUMENT_DEFAULT_WEIGHTS;
}

/** Same rule for the GitHub/Docs blend. */
export function resolveBlendWeights(b: BlendWeights | null | undefined): BlendWeights {
  if (b == null) return DEFAULT_BLEND_WEIGHTS;
  if (weightsAreValid([b.wGitHub, b.wDocs])) return b;
  console.warn("[scoring] Invalid source blend; using the defaults instead.");
  return DEFAULT_BLEND_WEIGHTS;
}
