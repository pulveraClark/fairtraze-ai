// Pure helpers for the Docs comment list's light polling (comments live in Postgres, not in Yjs).

interface PollComment {
  id: number;
  parentId: number | null;
  resolvedAt: string | null;
  text: string;
}

/** True when two lists show the same thing, so a poll can skip a pointless re-render and re-decorate. */
export function sameComments(a: PollComment[], b: PollComment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.parentId !== y.parentId || x.resolvedAt !== y.resolvedAt || x.text !== y.text) return false;
  }
  return true;
}

/** Open (unresolved) top-level threads: the number shown on the Comments button. */
export function openThreadCount(comments: PollComment[]): number {
  return comments.filter((c) => c.parentId === null && !c.resolvedAt).length;
}

/** Comments in `next` that the viewer has not seen before (poll arrivals, never their own actions). */
export function newCommentCount(known: PollComment[], next: PollComment[]): number {
  const seen = new Set(known.map((c) => c.id));
  return next.filter((c) => !seen.has(c.id)).length;
}

/** The sentence for the polite live region and the small notice. */
export function newCommentsText(count: number): string {
  return count === 1 ? "1 new comment" : `${count} new comments`;
}
