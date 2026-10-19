import { useState } from "react";
import type { BoardResponse } from "@shared/taskTypes";
import type { TaskActions } from "../../hooks/useTaskActions";
import { OverflowMenu } from "../ui/OverflowMenu";
import { CommitLinkingDialog, TaskKeyDialog } from "./CommitLinkBar";
import { AddMilestoneDialog } from "./MilestoneStrip";
import { ManageLabelsDialog } from "./ManageLabelsDialog";

type Open = null | "milestone" | "labels" | "commits" | "key";

/**
 * The one leader-only "..." menu on the Tasks bar: board setup that is used rarely (milestones, labels,
 * commit linking, task key). Members and read-only viewers do not get it; the server still decides who may do what.
 */
export function TasksMenu({ board, actions }: { board: BoardResponse; actions: TaskActions }) {
  const [open, setOpen] = useState<Open>(null);
  if (!board.viewer.isLeader || board.viewer.readOnly) return null;

  return (
    <>
      <OverflowMenu
        label="More task options"
        items={[
          { label: "Add milestone", onSelect: () => setOpen("milestone") },
          { label: "Manage labels", onSelect: () => setOpen("labels") },
          { label: "Commit linking", onSelect: () => setOpen("commits") },
          { label: "Change task key", onSelect: () => setOpen("key") },
        ]}
      />
      {open === "milestone" && (
        <AddMilestoneDialog
          deadline={board.group.deadline}
          onClose={() => setOpen(null)}
          onCreate={async (input) => { await actions.createMilestone(input); setOpen(null); }}
        />
      )}
      {open === "labels" && (
        <ManageLabelsDialog
          board={board}
          onCreate={(input) => actions.createLabel(input)}
          onRename={(id, name) => actions.renameLabel(id, name)}
          onDelete={(id) => actions.deleteLabel(id)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "commits" && <CommitLinkingDialog board={board} onClose={() => setOpen(null)} />}
      {open === "key" && <TaskKeyDialog board={board} onClose={() => setOpen(null)} />}
    </>
  );
}
