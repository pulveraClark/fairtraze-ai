import type { AiSummaryEvidence } from "@shared/aiReviewTypes.js";

// Deterministic, no-AI wording used when the AI is unavailable or its text was rejected. It only
// states facts that were counted: files changed, commits, Docs sections.

export const NO_ACTIVITY_LINE = "No recorded commits or Docs text to summarize yet.";

export function mergeFiles(
  perCommit: Array<Array<{ path: string; added: number; removed: number }>>,
  limit = 8,
): AiSummaryEvidence["files"] {
  const byPath = new Map<string, { path: string; added: number; removed: number }>();
  for (const files of perCommit) {
    for (const f of files) {
      const cur = byPath.get(f.path) ?? { path: f.path, added: 0, removed: 0 };
      cur.added += f.added;
      cur.removed += f.removed;
      byPath.set(f.path, cur);
    }
  }
  return [...byPath.values()].sort((a, b) => b.added - a.added || a.path.localeCompare(b.path)).slice(0, limit);
}

export function factsSummary(evidence: AiSummaryEvidence, totalFiles?: number): string {
  const parts: string[] = [];
  if (evidence.commitCount > 0) {
    const files = totalFiles ?? evidence.files.length;
    const top = evidence.files.slice(0, 3).map((f) => f.path).join(", ");
    parts.push(
      `Changed ${files} file${files === 1 ? "" : "s"} across ${evidence.commitCount} commit${evidence.commitCount === 1 ? "" : "s"}${top ? `, including ${top}` : ""}.`,
    );
  }
  if (evidence.docSections.length > 0) {
    parts.push(`Edited Docs sections: ${evidence.docSections.slice(0, 4).join(", ")}.`);
  }
  return parts.length > 0 ? parts.join(" ") : NO_ACTIVITY_LINE;
}
