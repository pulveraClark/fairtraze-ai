export const COMMIT_IMPACT = {
  structural: 1.5,
  functional: 1.0,
  cosmetic:   0.5,
  trivial:    0.2,
} as const;

export type CommitImpact = keyof typeof COMMIT_IMPACT;

export const STRUCTURAL_NEW_FILES_THRESHOLD    = 2;
export const STRUCTURAL_FILES_TOUCHED_THRESHOLD = 5;
export const COSMETIC_CHURN_RATIO_MIN  = 0.8;
export const COSMETIC_CHURN_RATIO_MAX  = 1.2;
export const COSMETIC_MAX_TOTAL_LINES  = 20;
export const TRIVIAL_MAX_TOTAL_LINES   = 5;

export interface CommitStats {
  filesChanged:    number;
  newFilesCreated: number;
  additions:       number;
  deletions:       number;
  hasSourceFiles:  boolean;
}

export function classifyCommit(stats: CommitStats): CommitImpact {
  const { filesChanged, newFilesCreated, additions, deletions, hasSourceFiles } = stats;
  const totalLines = additions + deletions;

  // Trivial: tiny change touching no source files
  if (totalLines <= TRIVIAL_MAX_TOTAL_LINES && !hasSourceFiles) return "trivial";

  // Structural: creates 2+ new files OR touches 5+ files
  if (
    newFilesCreated >= STRUCTURAL_NEW_FILES_THRESHOLD ||
    filesChanged >= STRUCTURAL_FILES_TOUCHED_THRESHOLD
  )
    return "structural";

  // Cosmetic: only non-source files, OR edits with roughly equal adds/deletes and < 20 lines
  if (!hasSourceFiles) return "cosmetic";
  const ratio = deletions > 0 ? additions / deletions : Infinity;
  if (
    ratio >= COSMETIC_CHURN_RATIO_MIN &&
    ratio <= COSMETIC_CHURN_RATIO_MAX &&
    totalLines < COSMETIC_MAX_TOTAL_LINES
  )
    return "cosmetic";

  // Functional: default for substantive source-file changes
  return "functional";
}
