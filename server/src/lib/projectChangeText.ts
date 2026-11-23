// Wording for "the instructor changed the project" notices. Pure: no database, no scoring input.
// Students read these, so: plain sentences, no numbers from the scoring settings, and never a
// weight, threshold, Gini value, band or team-health label.

export type ChangeKind = "text" | "files" | "deadline" | "name" | "groupSize" | "scoring";

/** One bit per kind, stored in Alert.refId so several saves can be merged without a new column. */
export const CHANGE_BITS: Record<ChangeKind, number> = {
  text: 1,
  files: 2,
  deadline: 4,
  name: 8,
  groupSize: 16,
  scoring: 32,
};

const KIND_ORDER: ChangeKind[] = ["text", "files", "deadline", "name", "groupSize", "scoring"];

const KIND_LABEL: Record<ChangeKind, string> = {
  text: "instructions",
  files: "attached files",
  deadline: "deadline",
  name: "name",
  groupSize: "group size limit",
  scoring: "scoring settings",
};

export interface ChangeDetail {
  title?: string;
  deadline?: Date | null;
  maxGroupSize?: number;
}

export function maskOf(kinds: ChangeKind[]): number {
  return kinds.reduce((m, k) => m | CHANGE_BITS[k], 0);
}

export function kindsOf(mask: number): ChangeKind[] {
  return KIND_ORDER.filter((k) => (mask & CHANGE_BITS[k]) !== 0);
}

const MANILA = "Asia/Manila";

function manilaYear(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: MANILA, year: "numeric" }).format(d);
}

/** "Nov 20, 5:00 PM"; the year is added only when it is not the current year (Manila time). */
export function formatDeadline(deadline: Date, now: Date = new Date()): string {
  const withYear = manilaYear(deadline) !== manilaYear(now);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA,
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
  })
    .format(deadline)
    .replace(/[  ]/g, " ");
}

/**
 * The notice text for a set of changes. One change gets its own sentence; two or more get one short
 * generic line. Detail (the new deadline, name or size) is only used for a single change, because a
 * merged notice may hold older values that the detail no longer describes.
 */
export function buildProjectChangeMessage(mask: number, detail: ChangeDetail = {}, now: Date = new Date()): string {
  const kinds = kindsOf(mask);
  if (kinds.length === 0) return "Your instructor updated the project.";
  if (kinds.length > 1) {
    return `Your instructor made ${kinds.length} changes to the project: ${kinds.map((k) => KIND_LABEL[k]).join(", ")}. Open your group to see them.`;
  }
  switch (kinds[0]) {
    case "text":
      return "Your instructor updated the project instructions.";
    case "files":
      return "Your instructor changed the files attached to the instructions.";
    case "deadline":
      return detail.deadline
        ? `The deadline changed. It is now ${formatDeadline(detail.deadline, now)}.`
        : "The deadline changed. Open your group to see the new date.";
    case "name":
      return detail.title ? `The project was renamed to “${detail.title}”.` : "The project was renamed.";
    case "groupSize":
      return typeof detail.maxGroupSize === "number"
        ? `The group size limit is now ${detail.maxGroupSize}.`
        : "The group size limit changed.";
    case "scoring":
      return "Your instructor updated the scoring settings. Reports update the next time they are analyzed.";
  }
}
