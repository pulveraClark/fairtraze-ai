import type { ReactNode } from "react";

/** One banner on the instructor report. Lower `priority` number = more important. */
export interface ReportNotice {
  id: string;
  priority: number;
  node: ReactNode;
}

/** Report notices by importance: act-on-it first, context last. */
export const NOTICE_PRIORITY = { stale: 1, unmatchedLogins: 2, docsApproximate: 3, quietSource: 4 } as const;

/** Most important `maxVisible` notices (stable for equal priority) and the rest, which sit behind "n more". */
export function splitNotices(notices: ReportNotice[], maxVisible = 1): { visible: ReportNotice[]; hidden: ReportNotice[] } {
  const sorted = notices
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.priority - b.n.priority || a.i - b.i)
    .map((x) => x.n);
  return { visible: sorted.slice(0, maxVisible), hidden: sorted.slice(maxVisible) };
}

export function moreNoticesLabel(count: number): string {
  return count === 1 ? "1 more notice" : `${count} more notices`;
}
