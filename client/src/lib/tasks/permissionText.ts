import type { BoardResponse, BoardTask } from "@shared/taskTypes";

// Plain-words reasons shown (as a tooltip and to screen readers) next to a control the viewer may
// not use. They only EXPLAIN what the server already decided in `task.permissions`; the client never
// decides permissions itself.

type Kind = "edit" | "setDue" | "assign" | "move" | "delete" | "comment" | "watch" | "heading";

export function lockReason(kind: Kind, task: Pick<BoardTask, "status">, viewer: BoardResponse["viewer"]): string {
  if (viewer.readOnly) return "Instructors and admins have view-only access to tasks.";
  switch (kind) {
    case "assign":
    case "delete":
      return "Only the group leader can do this.";
    case "move":
      return task.status === "DONE"
        ? "Only the group leader can move a task out of Done."
        : "Only the assigned member or the group leader can move this task.";
    case "edit":
    case "setDue":
    case "heading":
      return task.status === "DONE"
        ? "This task is Done, so only the group leader can change it."
        : "Only the assigned member or the group leader can change this.";
    case "comment":
    case "watch":
      return "Only group members can do this.";
  }
}
