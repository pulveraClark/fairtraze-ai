import { z } from "zod";
import type { ProjectScoringConfig } from "@shared/types.js";

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
} as const;

// Mirrors shared/src/scoring.ts defaults; used for groups without an assignment.
export const DEFAULT_SCORING_CONFIG: ProjectScoringConfig = {
  weights:    { commits: 0.4, lines: 0.4, activeDays: 0.2 },
  thresholds: { freeRider: 0.5, overload: 1.75, deadlineDriven: 0.6 },
  blend:      { wGitHub: 0.5, wDocs: 0.5 },
};

// blend is always populated on the returned config regardless of sourceType; only meaningful for COMBINED.
export function assignmentScoringConfig(a: ScoringConfigRow | null | undefined): ProjectScoringConfig {
  if (!a) return structuredClone(DEFAULT_SCORING_CONFIG);
  return {
    weights: { commits: a.weightCommits, lines: a.weightLines, activeDays: a.weightActiveDays },
    thresholds: { freeRider: a.freeRiderThreshold, overload: a.overloadThreshold, deadlineDriven: a.deadlineDrivenThreshold },
    blend: { wGitHub: a.weightGithub, wDocs: a.weightDocs },
  };
}

const EPSILON = 1e-6;
const same = (x: number, y: number) => Math.abs(x - y) <= EPSILON;

// Value equality of two configs. `blend` is compared only when `includeBlend` (COMBINED).
export function configsEqual(a: ProjectScoringConfig, b: ProjectScoringConfig, includeBlend: boolean): boolean {
  if (!same(a.weights.commits, b.weights.commits) || !same(a.weights.lines, b.weights.lines)
    || !same(a.weights.activeDays, b.weights.activeDays)) return false;
  if (!same(a.thresholds.freeRider, b.thresholds.freeRider) || !same(a.thresholds.overload, b.thresholds.overload)
    || !same(a.thresholds.deadlineDriven, b.thresholds.deadlineDriven)) return false;
  if (includeBlend) {
    if (!a.blend || !b.blend) return false;
    if (!same(a.blend.wGitHub, b.blend.wGitHub) || !same(a.blend.wDocs, b.blend.wDocs)) return false;
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
      },
    }),
    prismaClient.project.updateMany({
      where: { assignmentId: assignment.id },
      data:  { scoringConfigChangedAt: new Date() },
    }),
  ]);
  return next;
}
