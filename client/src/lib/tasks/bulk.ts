import {
  TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, type BoardResponse, type BulkAction, type BulkEditResponse,
} from "@shared/taskTypes";

const plural = (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`;

/** Status and assignee changes cannot be undone in bulk, so they ask first. */
export function needsConfirm(action: BulkAction): boolean {
  return action.type === "status" || action.type === "assign";
}

function memberName(board: BoardResponse, userId: number | null): string {
  return board.members.find((m) => m.userId === userId)?.name ?? "that member";
}

const names = <T extends { id: number; name: string }>(list: T[], ids: number[] = []) =>
  ids.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean).join(", ");

/** The question shown before a bulk status or assignee change, e.g. "Move 5 tasks to Done?". */
export function confirmQuestion(action: BulkAction, count: number, board: BoardResponse): string {
  if (action.type === "status") return `Move ${plural(count)} to ${TASK_STATUS_LABELS[action.status]}?`;
  if (action.type === "assign") {
    return action.userId === null ? `Unassign ${plural(count)}?` : `Assign ${plural(count)} to ${memberName(board, action.userId)}?`;
  }
  return "";
}

/** "Moved 3 tasks to Done" or, when some were left alone, "Moved 2 of 3 tasks to Done. 1 skipped." */
export function resultMessage(action: BulkAction, requested: number, res: BulkEditResponse, board: BoardResponse): string {
  const applied = requested - res.skipped.length;
  const subject = res.skipped.length ? `${applied} of ${plural(requested)}` : plural(applied);
  let text: string;
  switch (action.type) {
    case "status": text = `Moved ${subject} to ${TASK_STATUS_LABELS[action.status]}`; break;
    case "assign":
      text = action.userId === null ? `Unassigned ${subject}` : `Assigned ${subject} to ${memberName(board, action.userId)}`;
      break;
    case "priority": text = `Set ${TASK_PRIORITY_LABELS[action.priority]} priority on ${subject}`; break;
    case "milestone":
      text = action.milestoneId === null
        ? `Removed the milestone from ${subject}`
        : `Set milestone ${board.milestones.find((m) => m.id === action.milestoneId)?.name ?? ""} on ${subject}`.replace("  ", " ");
      break;
    case "labels":
      text = action.add?.length
        ? `Added label ${names(board.labels, action.add)} to ${subject}`
        : `Removed label ${names(board.labels, action.remove)} from ${subject}`;
      break;
  }
  return res.skipped.length ? `${text}. ${res.skipped.length} skipped.` : text;
}
