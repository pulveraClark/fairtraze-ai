import { prisma } from "./prisma.js";
import { computeAuthorshipMap, type AuthorshipMap, type AuthorshipSpan } from "../collab/authorshipMap.js";

// Memoises the authorship map of a document for GET /api/groups/:id/document/authorship.
// computeAuthorshipMap (unchanged, in collab/) replays the document's WHOLE EditEvent log, which grows
// with every edit and is repeated each time a client re-creates its editor.
//
// Correctness rule: the cache can only be a MISS or an exact match, never stale. Every call first runs a
// cheap probe (highest event id + event count of the document). A cached map is served only when the probe
// equals the probe taken before that map was computed. New events raise the highest id, removed events
// lower the count, so any change to the log makes the keys differ and the map is recomputed. The probe
// is read BEFORE the replay, so an event that lands during a replay is simply picked up by the next call.
//
// Only the spans are cached. User names are read on every call (one primary-key query), so a renamed
// user is never shown under the old name. Read-only: it never writes, never touches the live room.

interface Probe { maxId: number | null; count: number }
interface Entry extends Probe { spans: AuthorshipSpan[] }

const MAX_DOCUMENTS = 50;
const cache = new Map<number, Entry>(); // insertion order = least recently used first
const inflight = new Map<string, Promise<AuthorshipMap>>();

async function probe(documentId: number): Promise<Probe> {
  const r = await prisma.editEvent.aggregate({ where: { documentId }, _max: { id: true }, _count: { _all: true } });
  return { maxId: r._max.id, count: r._count._all };
}

function remember(documentId: number, entry: Entry): void {
  cache.delete(documentId);
  cache.set(documentId, entry);
  while (cache.size > MAX_DOCUMENTS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function getAuthorshipMapCached(documentId: number): Promise<AuthorshipMap> {
  const p = await probe(documentId);
  const hit = cache.get(documentId);
  if (hit && hit.maxId === p.maxId && hit.count === p.count) {
    remember(documentId, hit);
    const userIds = Array.from(new Set(hit.spans.map((s) => s.userId)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    return { spans: hit.spans, users };
  }

  // Miss: replay once, shared by concurrent callers that saw the same probe.
  const flightKey = `${documentId}:${p.maxId}:${p.count}`;
  let flight = inflight.get(flightKey);
  if (!flight) {
    flight = computeAuthorshipMap(documentId)
      .then((map) => {
        remember(documentId, { ...p, spans: map.spans });
        return map;
      })
      .finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, flight);
  }
  return flight;
}

/** Tests only. */
export function clearAuthorshipMapCache(): void {
  cache.clear();
  inflight.clear();
}
