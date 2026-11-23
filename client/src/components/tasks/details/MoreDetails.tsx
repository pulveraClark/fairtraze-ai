import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { BoardTask, TaskDetails } from "@shared/taskTypes";
import { FOCUS_LIGHT } from "../../ui/styles";
import { ChevronDownIcon, ChevronUpIcon } from "../icons";

/**
 * True when any of the extra fields already has something in it: subtasks, attachments, linked commits,
 * labels, a milestone or a linked document heading. Watchers are left out on purpose: the creator and the
 * assignee watch automatically, so every task would count as having content.
 */
export function hasMoreContent(task: BoardTask, d: Pick<TaskDetails, "subtasks" | "attachments" | "commits">): boolean {
  return (
    d.subtasks.length > 0 ||
    d.attachments.length > 0 ||
    d.commits.length > 0 ||
    task.labelIds.length > 0 ||
    task.milestoneId !== null ||
    !!task.docHeading
  );
}

/** The "More details" disclosure in the task window. Starts open only when `open` (there is content); the person's own toggle wins after that. */
export function MoreDetails({ open: defaultOpen, children }: { open: boolean; children: ReactNode }) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? defaultOpen;
  const id = useId();
  const titleId = `${id}-title`;
  return (
    <section aria-label="More details" className="rounded-lg border border-slate-200">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-labelledby={titleId}
        onClick={() => setChosen(!open)}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50 ${FOCUS_LIGHT}`}
      >
        <span id={titleId}>More details</span>
        <span className="flex items-center gap-1 text-xs font-normal text-slate-700">
          Subtasks, files, labels, milestone, linked heading, watchers
          {open ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
        </span>
      </button>
      {open && <div id={id} className="space-y-5 border-t border-slate-200 p-3">{children}</div>}
    </section>
  );
}
