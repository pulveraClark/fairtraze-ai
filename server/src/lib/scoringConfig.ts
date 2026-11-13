import { z } from "zod";
import type { ProjectScoringConfig, DocumentScoringWeights } from "@shared/types.js";
import { DOCUMENT_DEFAULT_WEIGHTS, DEFAULT_BLEND_WEIGHTS, weightsAreValid } from "@shared/weights.js";
import { DEFAULT_DOCS_IMAGE_LIMIT, resolveDocsImageLimit } from "@shared/imageCredit.js";

// Scoring settings live on Assignment (the "project" in the UI) and apply to every group in it.
// The legacy same-named columns on Project are no longer read.

export interface ScoringConfigRow {
  weightCommits: number;
  weightLines: number;
  weightActiveDays: number;
  freeRiderThreshold: number;
  overloadThreshold: number;
  deadlineDrivenThreshold: number;
  weightGithub: number;
  weightDocs: number;
  docsWeightRetainedText: number;
  docsWeightSessions: number;
  docsWeightActiveDays: number;
  docsImageLimit: number | null;
}

export const ASSIGNMENT_CONFIG_SELECT = {
  weightCommits: true,
  weightLines: true,
  weightActiveDays: true,
  freeRiderThreshold: true,
  overloadThreshold: true,
  deadlineDrivenThreshold: true,
  weightGithub: true,
  weightDocs: true,
  docsWeightRetainedText: true,
  docsWeightSessions: true,
  docsWeightActiveDays: true,
  docsImageLimit: true,
} as const;

// Mirrors shared/src/scoring.ts defaults; used for groups without an assignment.
export const DEFAULT_SCORING_CONFIG: ProjectScoringConfig = {
  weights:    { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend:      { ...DEFAULT_BLEND_WEIGHTS },
  docsWeights: { ...DOCUMENT_DEFAULT_WEIGHTS },
  docsImageLimit: DEFAULT_DOCS_IMAGE_LIMIT,
};

// Docs weights used before scoring rules version 3 (fixed in code). A report snapshot saved without
// docsWeights was scored with these.
const LEGACY_DOCS_WEIGHTS: DocumentScoringWeights = { retainedText: 0.6, sessions: 0.2, activeDays: 0.2 };

// blend is always populated on the returned config regardless of sourceType; only meaningful for COMBINED.
export function assignmentScoringConfig(a: ScoringConfigRow | null | undefined): ProjectScoringConfig {
  if (!a) return structuredClone(DEFAULT_SCORING_CONFIG);
  return {
    weights: { commits: a.weightCommits, lines: a.weightLines, activeDays: a.weightActiveDays },
    thresholds: { freeRider: a.freeRiderThreshold, overload: a.overloadThreshold, deadlineDriven: a.deadlineDrivenThreshold },
    blend: { wGitHub: a.weightGithub, wDocs: a.weightDocs },
    docsWeights: { retainedText: a.docsWeightRetainedText, sessions: a.docsWeightSessions, activeDays: a.docsWeightActiveDays },
    docsImageLimit: a.docsImageLimit,
  };
}

const EPSILON = 1e-6;
const same = (x: number, y: number) => Math.abs(x - y) <= EPSILON;

// Value equality of two configs. `blend` is compared only when `includeBlend` (COMBINED); the Docs
// weights only when `includeDocs` (EDITOR and COMBINED; defaults to `includeBlend`).
export function configsEqual(a: ProjectScoringConfig, b: ProjectScoringConfig, includeBlend: boolean, includeDocs: boolean = includeBlend): boolean {
  if (!same(a.weights.commits, b.weights.commits) || !same(a.weights.lines, b.weights.lines)
    || !same(a.weights.activeDays, b.weights.activeDays)) return false;
  if (!same(a.thresholds.freeRider, b.thresholds.freeRider) || !same(a.thresholds.overload, b.thresholds.overload)
    || !same(a.thresholds.deadlineDriven, b.thresholds.deadlineDriven)) return false;
  if (includeBlend) {
    if (!a.blend || !b.blend) return false;
    if (!same(a.blend.wGitHub, b.blend.wGitHub) || !same(a.blend.wDocs, b.blend.wDocs)) return false;
  }
  if (includeDocs) {
    const da = a.docsWeights ?? LEGACY_DOCS_WEIGHTS;
    const db = b.docsWeights ?? LEGACY_DOCS_WEIGHTS;
    if (!same(da.retainedText, db.retainedText) || !same(da.sessions, db.sessions) || !same(da.activeDays, db.activeDays)) return false;
    // A snapshot saved without the field reads as the default (5); null is "No limit".
    if (resolveDocsImageLimit(a.docsImageLimit) !== resolveDocsImageLimit(b.docsImageLimit)) return false;
  }
  return true;
}

export const scoringConfigBodySchema = z.object({
  weights: z.object({
    commits:    z.number().min(0).max(1),
    lines:      z.number().min(0).max(1),
    activeDays: z.number().min(0).max(1),
  }),
  thresholds: z.object({
    freeRider:      z.number().min(0).max(1),
    overload:       z.number().min(1),
    deadlineDriven: z.number().min(0).max(1),
  }),
  blend: z.object({
    wGitHub: z.number().min(0).max(1),
    wDocs:   z.number().min(0).max(1),
  }),
  // Optional so an older client that does not send it leaves the stored Docs weights unchanged.
  docsWeights: z.object({
    retainedText: z.number().min(0).max(1),
    sessions:     z.number().min(0).max(1),
    activeDays:   z.number().min(0).max(1),
  }).optional(),
  // 3, 5 or 10 images per member, or null for no limit. Omitted keeps the stored value.
  docsImageLimit: z.union([z.literal(3), z.literal(5), z.literal(10), z.null()]).optional(),
});

// Returns an error message, or null when the weights/blend sums are valid (±0.001).
export function validateConfigSums(c: z.infer<typeof scoringConfigBodySchema>): string | null {
  const weightSum = c.weights.commits + c.weights.lines + c.weights.activeDays;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    return `Weights must sum to 1.0 (got ${weightSum.toFixed(3)}). Adjust the three values so they add up to exactly 1.`;
  }
  const blendSum = c.blend.wGitHub + c.blend.wDocs;
  if (Math.abs(blendSum - 1.0) > 0.001) {
    return `Blend weights must sum to 1.0 (got ${blendSum.toFixed(3)}). Adjust wGitHub/wDocs so they add up to exactly 1.`;
  }
  if (c.docsWeights) {
    const d = c.docsWeights;
    if (!weightsAreValid([d.retainedText, d.sessions, d.activeDays])) {
      const docsSum = d.retainedText + d.sessions + d.activeDays;
      return `Docs weights add up to ${docsSum.toFixed(2)}. They must add up to 1.00.`;
    }
  }
  return null;
}

// Shared by PATCH /api/assignments/:id/scoring-config and the legacy PATCH /api/projects/:id/config
// alias. Writes the assignment and marks every group stale, but only if a value actually changed.
export async function saveAssignmentScoringConfig(
  prismaClient: typeof import("./prisma.js").prisma,
  assignment: ScoringConfigRow & { id: number },
  next: ProjectScoringConfig,
): Promise<ProjectScoringConfig> {
  const current = assignmentScoringConfig(assignment);
  // A client that sends no Docs weights keeps the stored ones.
  next = {
    ...next,
    docsWeights: next.docsWeights ?? current.docsWeights,
    docsImageLimit: next.docsImageLimit === undefined ? current.docsImageLimit : next.docsImageLimit,
  };
  if (configsEqual(current, next, true)) return current;
  await prismaClient.$transaction([
    prismaClient.assignment.update({
      where: { id: assignment.id },
      data: {
        weightCommits:           next.weights.commits,
        weightLines:             next.weights.lines,
        weightActiveDays:        next.weights.activeDays,
        freeRiderThreshold:      next.thresholds.freeRider,
        overloadThreshold:       next.thresholds.overload,
        deadlineDrivenThreshold: next.thresholds.deadlineDriven,
        weightGithub:            next.blend!.wGitHub,
        weightDocs:              next.blend!.wDocs,
        docsWeightRetainedText:  next.docsWeights!.retainedText,
        docsWeightSessions:      next.docsWeights!.sessions,
        docsWeightActiveDays:    next.docsWeights!.activeDays,
        docsImageLimit:          next.docsImageLimit ?? null,
      },
    }),
    prismaClient.project.updateMany({
      where: { assignmentId: assignment.id },
      data:  { scoringConfigChangedAt: new Date() },
    }),
  ]);
  return next;
}
