import type { ProjectSummaryItem } from "@shared/types";

export interface AssignmentBenchmark {
  averageGini: number | null;
  analyzedPeerCount: number;
}

// Compares already-computed, already-ownership-scoped ProjectSummaryItem rows —
// no new fetch, no new endpoint, no scoring changes. Only analyzed siblings under
// the same assignment count; unanalyzed peers and projects under a different (or
// null) assignmentId are excluded. Pass excludeProjectId to compute "the average
// of every OTHER group" (ProjectDetailPage); omit it to average the whole visible
// list as a page-level reference stat (AssignmentPage).
export function computeAssignmentBenchmark(
  items: ProjectSummaryItem[],
  assignmentId: number | null,
  options: { excludeProjectId?: number } = {}
): AssignmentBenchmark {
  if (assignmentId === null) return { averageGini: null, analyzedPeerCount: 0 };

  const peers = items.filter(
    (item) =>
      item.assignmentId === assignmentId &&
      item.projectId !== options.excludeProjectId &&
      item.isAnalyzed &&
      item.gini !== null
  );

  if (peers.length === 0) return { averageGini: null, analyzedPeerCount: 0 };

  const sum = peers.reduce((total, item) => total + (item.gini as number), 0);
  return { averageGini: sum / peers.length, analyzedPeerCount: peers.length };
}
