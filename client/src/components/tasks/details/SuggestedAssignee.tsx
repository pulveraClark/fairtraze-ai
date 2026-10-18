import { useMemo } from "react";
import type { BoardResponse, BoardTask } from "@shared/taskTypes";
import { suggestAssigneeForTask } from "../../../lib/taskWorkload";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT } from "../../ui/styles";

interface Props {
  board: BoardResponse;
  task: BoardTask;
  onConfirm: (userId: number) => void;
  /** "Change": the leader picks someone else. */
  onChange: () => void;
}

/**
 * Leader-only hint under the assignee. A task linked to a document heading or labelled "Documentation"
 * goes to Documentation members, anything else to Developers; among them, whoever has the fewest open
 * tasks. It only suggests: nothing is assigned until the leader confirms, and it never affects scores.
 */
export function SuggestedAssignee({ board, task, onConfirm, onChange }: Props) {
  const suggestion = useMemo(() => {
    const labelNames = board.labels.filter((l) => task.labelIds.includes(l.id)).map((l) => l.name);
    return suggestAssigneeForTask(board.members, board.tasks, task, labelNames);
  }, [board.labels, board.members, board.tasks, task]);

  if (!suggestion || suggestion.userId === task.assignedToUserId) return null;

  return (
    <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2.5" role="group" aria-label="Suggested assignee">
      <p className="text-xs font-semibold text-indigo-900">Suggested</p>
      <p className="text-sm font-medium text-slate-900">{suggestion.name}</p>
      <p className="text-xs text-slate-800">{suggestion.reason}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onConfirm(suggestion.userId)} className={BUTTON_PRIMARY_COMPACT}>Confirm</button>
        <button type="button" onClick={onChange} className={BUTTON_SECONDARY_COMPACT}>Change</button>
      </div>
    </div>
  );
}
