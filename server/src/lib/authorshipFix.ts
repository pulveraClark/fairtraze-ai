import { prisma } from "./prisma.js";

// Date the authorship-capture fix (extractPlainText using toDelta() instead of toString(), which
// had leaked mark tags into recorded offsets) went live. Docs data recorded before this may be
// approximate. Set AUTHORSHIP_FIX_AT (ISO timestamp) on the host to the exact deploy time; the
// default is the fix date at 00:00 UTC.
const DEFAULT_AUTHORSHIP_FIX_AT = "2026-10-08T00:00:00.000Z";

export function getAuthorshipFixAt(): Date {
  const raw = process.env.AUTHORSHIP_FIX_AT?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(DEFAULT_AUTHORSHIP_FIX_AT);
}

// True when the document has any EditEvent recorded before the fix. Computed at read time only —
// stored reports and the analyze stream are untouched. Pass null for "no document yet".
export async function documentHasPreFixEvents(documentId: number | null | undefined): Promise<boolean> {
  if (documentId == null) return false;
  const found = await prisma.editEvent.findFirst({
    where: { documentId, timestamp: { lt: getAuthorshipFixAt() } },
    select: { id: true },
  });
  return found !== null;
}

// Convenience for routes that start from a projectId and a sourceType: only EDITOR/COMBINED
// assignments are ever affected.
export async function docsDataApproximateFor(projectId: number, sourceType: string | null | undefined): Promise<boolean> {
  if (sourceType !== "EDITOR" && sourceType !== "COMBINED") return false;
  const doc = await prisma.document.findUnique({ where: { groupId: projectId }, select: { id: true } });
  return documentHasPreFixEvents(doc?.id);
}
