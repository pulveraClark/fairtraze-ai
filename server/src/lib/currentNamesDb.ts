import { prisma } from "./prisma.js";
import { buildNameMap, currentPeopleFrom, storedNameRefs, swapNames, type CurrentPerson, type StoredNameRef } from "./currentNames.js";

// Database side of the display-time names (see currentNames.ts). Read-only.

export async function loadCurrentNames(projectId: number): Promise<Map<number, CurrentPerson>> {
  const rows = await prisma.groupMembership.findMany({
    where: { projectId },
    select: { userId: true, user: { select: { name: true, githubUsername: true, deletedAt: true } } },
  });
  return currentPeopleFrom(rows);
}

export interface NarrativeSource {
  narrative?: string | null;
  narrativeNames?: StoredNameRef[];
  narrativeAt?: string;
  report?: { members?: ReadonlyArray<{ userId?: number; githubUsername?: string; studentName?: string }> };
}

/**
 * The narrative with current names. The old names come from `narrativeNames` (recorded when the text was saved).
 * Only an older narrative without that record reads the report row it was written on (newest row at or before
 * `narrativeAt`), and only when a narrative is actually shown.
 */
export async function narrativeForDisplay(
  projectId: number,
  stored: NarrativeSource,
  current: ReadonlyMap<number, CurrentPerson>,
): Promise<string | null> {
  const text = stored.narrative ?? null;
  if (!text) return text;
  let refs = stored.narrativeNames;
  if (!refs) {
    let source = stored.report;
    if (stored.narrativeAt) {
      const row = await prisma.report.findFirst({
        where: { projectId, generatedAt: { lte: new Date(stored.narrativeAt) } },
        orderBy: { generatedAt: "desc" },
        select: { content: true },
      });
      if (row?.content) {
        try { source = (JSON.parse(row.content) as NarrativeSource).report ?? source; } catch { /* keep current row */ }
      }
    }
    refs = storedNameRefs(source, current);
  }
  return swapNames(text, buildNameMap(refs, current));
}
