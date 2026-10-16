import type { BoardMember, BoardTask, TaskLabelColor } from "@shared/taskTypes";

// Label chips always show the label's name, so color is decoration, never the only signal.
export const LABEL_CHIP_CLASSES: Record<TaskLabelColor, string> = {
  gray: "bg-slate-100 text-slate-800 border-slate-300",
  blue: "bg-blue-50 text-blue-900 border-blue-300",
  green: "bg-emerald-50 text-emerald-900 border-emerald-300",
  amber: "bg-amber-50 text-amber-900 border-amber-300",
  red: "bg-red-50 text-red-900 border-red-300",
  violet: "bg-violet-50 text-violet-900 border-violet-300",
  teal: "bg-teal-50 text-teal-900 border-teal-300",
  pink: "bg-pink-50 text-pink-900 border-pink-300",
};

/** Tooltip for a card the viewer cannot move, e.g. "Only Ben Cruz or the group leader can move this task." */
export function moveDeniedMessage(task: BoardTask, members: BoardMember[]): string {
  const assignee = members.find((m) => m.userId === task.assignedToUserId);
  if (!assignee) return "Only the group leader can move this task.";
  if (task.status === "DONE") return "Only the group leader can move a task out of Done.";
  return `Only ${assignee.name} or the group leader can move this task.`;
}
