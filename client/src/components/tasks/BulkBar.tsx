import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type BoardResponse, type BulkAction } from "@shared/taskTypes";
import { FOCUS_LIGHT } from "../ui/styles";

interface Props {
  board: BoardResponse;
  count: number;
  busy: boolean;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
}

const SELECT = `min-h-9 rounded-lg border border-slate-500 bg-white px-2 text-sm text-slate-900 ${FOCUS_LIGHT}`;
const BUTTON = `inline-flex min-h-9 items-center rounded-lg border border-slate-500 px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 ${FOCUS_LIGHT}`;

/**
 * Leader-only bar for editing the ticked tasks together. Each control applies at once when chosen
 * (the page asks first for status and assignee changes).
 */
export function BulkBar({ board, count, busy, onAction, onClear }: Props) {
  /** A select that acts on a choice and then returns to its prompt, so the same choice can be made again. */
  function pick(e: React.ChangeEvent<HTMLSelectElement>, toAction: (value: string) => BulkAction) {
    const value = e.target.value;
    e.target.value = "";
    if (value) onAction(toAction(value));
  }

  return (
    <div
      role="region"
      aria-label="Bulk edit"
      className="sticky bottom-3 z-20 flex flex-wrap items-center gap-2 rounded-xl bg-slate-900 p-3 text-white shadow-lg"
    >
      <span role="status" className="mr-1 text-sm font-semibold tabular-nums">{count} selected</span>

      <button type="button" disabled={busy} onClick={() => onAction({ type: "status", status: "DONE" })} className={BUTTON}>
        Move to Done
      </button>

      <select aria-label="Assign" disabled={busy} defaultValue="" className={SELECT} onChange={(e) => pick(e, (v) => ({ type: "assign", userId: v === "none" ? null : Number(v) }))}>
        <option value="">Assign…</option>
        <option value="none">Unassigned</option>
        {board.members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
      </select>

      <select aria-label="Priority" disabled={busy} defaultValue="" className={SELECT} onChange={(e) => pick(e, (v) => ({ type: "priority", priority: v as (typeof TASK_PRIORITIES)[number] }))}>
        <option value="">Priority…</option>
        {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
      </select>

      {board.labels.length > 0 && (
        <select
          aria-label="Label"
          disabled={busy}
          defaultValue=""
          className={SELECT}
          onChange={(e) => pick(e, (v) => {
            const [kind, id] = v.split(":");
            return kind === "add" ? { type: "labels", add: [Number(id)] } : { type: "labels", remove: [Number(id)] };
          })}
        >
          <option value="">Label…</option>
          <optgroup label="Add label">
            {board.labels.map((l) => <option key={`a${l.id}`} value={`add:${l.id}`}>{l.name}</option>)}
          </optgroup>
          <optgroup label="Remove label">
            {board.labels.map((l) => <option key={`r${l.id}`} value={`remove:${l.id}`}>{l.name}</option>)}
          </optgroup>
        </select>
      )}

      <select aria-label="Milestone" disabled={busy} defaultValue="" className={SELECT} onChange={(e) => pick(e, (v) => ({ type: "milestone", milestoneId: v === "none" ? null : Number(v) }))}>
        <option value="">Milestone…</option>
        <option value="none">No milestone</option>
        {board.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <button type="button" onClick={onClear} className={`${BUTTON} ml-auto`}>Clear selection</button>
    </div>
  );
}
