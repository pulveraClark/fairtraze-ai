import { useState } from "react";
import type { BoardTask } from "@shared/taskTypes";
import { useTaskBoardQuery } from "../../../hooks/useGroupQueries";
import { useTaskActions } from "../../../hooks/useTaskActions";
import { BUTTON_SECONDARY_COMPACT } from "../../ui/styles";
import { AlertTriangleIcon } from "../icons";
import { HeadingPicker } from "./HeadingPicker";

/** A task whose linked heading the Document tab should scroll to. */
export interface DocHeadingFocus {
  taskId: number;
  taskKey: string;
  heading: string;
  /** True once the editor looked for the heading and did not find it. */
  missing: boolean;
}

interface Props {
  projectId: number;
  focus: DocHeadingFocus;
  /** The leader or assignee picked a new heading (or removed the link). */
  onRelink: (heading: string | null) => void;
  onDismiss: () => void;
}

/**
 * Shown above the document when a task's linked heading is not in it any more. The document opens at
 * the top, and the leader or the assigned member can pick a new heading right here.
 */
export function LinkedHeadingNotice({ projectId, focus, onRelink, onDismiss }: Props) {
  const board = useTaskBoardQuery(projectId).data;
  const actions = useTaskActions(projectId);
  const task: BoardTask | undefined = board?.tasks.find((t) => t.id === focus.taskId);
  const [error, setError] = useState("");
  const canEdit = !!task?.permissions.edit;

  async function relink(heading: string | null) {
    if (!task) return;
    setError("");
    try {
      await actions.updateTask(task, { docHeading: heading });
      onRelink(heading);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the linked heading.");
    }
  }

  return (
    <div role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-start gap-2 text-sm font-medium text-amber-950">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          That heading was renamed or removed. {focus.taskKey} is linked to "{focus.heading}", which is not in the document now.
        </span>
      </p>
      {canEdit && task && (
        <div className="mt-2 max-w-sm">
          <p className="mb-1 text-sm font-medium text-slate-900">Pick the heading this task belongs to</p>
          <HeadingPicker projectId={projectId} id="relink-heading" current={null} onSelect={(h) => void relink(h)} />
        </div>
      )}
      {!canEdit && <p className="mt-1 text-sm text-slate-800">The group leader or the assigned member can pick a new heading.</p>}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-800">{error}</p>}
      <button type="button" onClick={onDismiss} className={`mt-2 ${BUTTON_SECONDARY_COMPACT}`}>Dismiss</button>
    </div>
  );
}
