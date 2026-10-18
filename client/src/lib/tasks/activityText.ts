import {
  TASK_PRIORITY_LABELS, TASK_STATUS_LABELS,
  type BoardResponse, type TaskActivityEntry, type TaskPriority, type TaskStatus,
} from "@shared/taskTypes";
import { formatDue } from "./dates";
import { FORMER_MEMBER } from "./mentions";

// History entries are stored as ids and values only; this turns them into plain sentences using the
// live board, so a renamed member shows their current name and a removed one reads "a former member".

type Board = Pick<BoardResponse, "members" | "milestones" | "labels">;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function who(board: Board, id: number | null): string {
  if (id === null) return "Someone";
  return board.members.find((m) => m.userId === id)?.name ?? "A former member";
}
function whom(board: Board, id: number | null): string {
  if (id === null) return "nobody";
  return board.members.find((m) => m.userId === id)?.name ?? FORMER_MEMBER;
}
const status = (v: unknown) => TASK_STATUS_LABELS[v as TaskStatus] ?? "another status";
const priority = (v: unknown) => TASK_PRIORITY_LABELS[v as TaskPriority]?.toLowerCase() ?? "another priority";

/** The sentence for one entry, without the date. e.g. "Ana moved it from To do to In progress". */
export function describeActivity(entry: TaskActivityEntry, board: Board): string {
  const actor = who(board, entry.actorId);
  const d = entry.data ?? {};
  switch (entry.type) {
    case "created": return `${actor} created this task`;
    case "status_changed": return `${actor} moved it from ${status(d.from)} to ${status(d.to)}`;
    case "assigned": return `${actor} assigned it to ${whom(board, num(d.to))}`;
    case "unassigned": return `${actor} unassigned it${num(d.from) !== null ? ` from ${whom(board, num(d.from))}` : ""}`;
    case "title_changed": return `${actor} changed the title`;
    case "description_changed": return `${actor} changed the description`;
    case "priority_changed": return `${actor} changed the priority from ${priority(d.from)} to ${priority(d.to)}`;
    case "due_changed": {
      const from = str(d.from);
      const to = str(d.to);
      if (!to) return `${actor} removed the due date`;
      return from ? `${actor} moved the due date from ${formatDue(from)} to ${formatDue(to)}` : `${actor} set the due date to ${formatDue(to)}`;
    }
    case "milestone_changed": {
      const to = num(d.to);
      if (to === null) return `${actor} removed it from its milestone`;
      const name = board.milestones.find((m) => m.id === to)?.name;
      return name ? `${actor} added it to the milestone "${name}"` : `${actor} added it to a milestone that was later removed`;
    }
    case "labels_changed": {
      const before = new Set(Array.isArray(d.from) ? (d.from as number[]) : []);
      const after = new Set(Array.isArray(d.to) ? (d.to as number[]) : []);
      const name = (id: number) => board.labels.find((l) => l.id === id)?.name ?? "a removed label";
      const added = [...after].filter((x) => !before.has(x)).map(name);
      const removed = [...before].filter((x) => !after.has(x)).map(name);
      const parts = [added.length ? `added ${added.join(", ")}` : "", removed.length ? `removed ${removed.join(", ")}` : ""].filter(Boolean);
      return `${actor} ${parts.join(" and ") || "changed the labels"}`;
    }
    case "doc_heading_changed": return `${actor} changed the linked document heading`;
    case "subtask_added": return `${actor} added the subtask "${str(d.title) ?? ""}"`;
    case "subtask_done": return `${actor} completed the subtask "${str(d.title) ?? ""}"`;
    case "subtask_reopened": return `${actor} reopened the subtask "${str(d.title) ?? ""}"`;
    case "subtask_removed": return `${actor} removed the subtask "${str(d.title) ?? ""}"`;
    case "comment_added": return `${actor} commented`;
    case "attachment_added": return `${actor} attached ${str(d.filename) ?? "a file"}`;
    case "attachment_removed": return `${actor} removed ${str(d.filename) ?? "an attachment"}`;
    default: return `${actor} updated this task`;
  }
}

/** "Oct 15, 10:40 AM" in the school's time zone (Asia/Manila). */
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}
