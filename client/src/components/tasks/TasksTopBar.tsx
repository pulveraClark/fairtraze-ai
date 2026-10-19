import type { ReactNode, RefObject } from "react";
import type { BoardResponse, TaskPriority } from "@shared/taskTypes";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@shared/taskTypes";
import { Avatar } from "../Avatar";
import { usePopover } from "../../hooks/usePopover";
import { menuFilterCount, hasAnyFilter, NO_FILTERS, statusLine, type TaskFilters } from "../../lib/tasks/filters";
import type { DueBucket } from "../../lib/tasks/dates";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../ui/styles";
import type { TaskView } from "../../lib/tasks/view";
import { ChevronDownIcon, FilterIcon, PlusIcon, SearchIcon } from "./icons";
import { ViewSwitch } from "./ViewSwitch";

interface Props {
  board: BoardResponse;
  filters: TaskFilters;
  onChange: (next: TaskFilters) => void;
  shown: number;
  total: number;
  onNewTask: () => void;
  view: TaskView;
  onViewChange: (view: TaskView) => void;
  /** So the "/" shortcut can focus the search box. */
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Opens the Workload panel (offered to the leader, the class instructor and admins). */
  onWorkload?: () => void;
  /** Leader-only "..." menu (board setup); rendered last. */
  leaderMenu?: ReactNode;
}

const DUE_OPTIONS: { value: DueBucket; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "this-week", label: "This week" },
  { value: "later", label: "Later" },
];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function TasksTopBar({ board, filters, onChange, shown, total, onNewTask, view, onViewChange, searchRef, onWorkload, leaderMenu }: Props) {
  const menu = usePopover();
  const activeMenuFilters = menuFilterCount(filters);
  const line = statusLine(filters, board.members, shown, total);
  const anySelected = filters.memberIds.length > 0;
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitch view={view} onChange={onViewChange} />
        <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <input
            ref={searchRef}
            type="text"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search tasks"
            aria-label="Search tasks"
            className={`min-h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-600 ${FOCUS_LIGHT}`}
          />
        </div>

        <div role="group" aria-label="Filter by member" className="flex items-center">
          {board.members.map((m) => {
            const selected = filters.memberIds.includes(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                aria-pressed={selected}
                aria-label={m.name}
                title={m.name}
                onClick={() => set({ memberIds: toggle(filters.memberIds, m.userId) })}
                className={`-ml-1 flex h-11 w-10 items-center justify-center rounded-full first:ml-0 ${FOCUS_LIGHT}`}
              >
                <Avatar
                  userId={m.userId}
                  name={m.name}
                  avatarUpdatedAt={m.avatarUpdatedAt}
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-900 transition ${
                    selected ? "ring-2 ring-indigo-700 ring-offset-2" : anySelected ? "opacity-40" : ""
                  }`}
                />
              </button>
            );
          })}
          {anySelected && (
            <button
              type="button"
              onClick={() => set({ memberIds: [] })}
              className={`ml-1 min-h-9 rounded-lg px-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50 ${FOCUS_LIGHT}`}
            >
              Clear
            </button>
          )}
        </div>

        {board.viewer.isMember && (
          <button
            type="button"
            aria-pressed={filters.myTasks}
            onClick={() => set({ myTasks: !filters.myTasks })}
            className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-sm font-semibold ${FOCUS_LIGHT} ${
              filters.myTasks
                ? "border-indigo-700 bg-indigo-700 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            My tasks
          </button>
        )}

        <div className="relative" ref={menu.ref}>
          <button
            type="button"
            ref={menu.triggerRef}
            aria-expanded={menu.open}
            aria-haspopup="dialog"
            onClick={() => menu.setOpen(!menu.open)}
            className={BUTTON_SECONDARY_COMPACT}
          >
            <FilterIcon className="h-4 w-4" />
            Filter
            {activeMenuFilters > 0 && (
              <span className="rounded-full bg-indigo-700 px-1.5 text-xs font-semibold text-white">{activeMenuFilters}</span>
            )}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
          {menu.open && (
            <div
              role="dialog"
              aria-label="Filter tasks"
              className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg"
            >
              <fieldset>
                <legend className="mb-1.5 font-semibold text-slate-900">Priority</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {TASK_PRIORITIES.map((p: TaskPriority) => (
                    <label key={p} className="flex min-h-9 items-center gap-2 text-slate-800">
                      <input
                        type="checkbox"
                        checked={filters.priorities.includes(p)}
                        onChange={() => set({ priorities: toggle(filters.priorities, p) })}
                        className="h-4 w-4"
                      />
                      {TASK_PRIORITY_LABELS[p]}
                    </label>
                  ))}
                </div>
              </fieldset>

              {board.labels.length > 0 && (
                <fieldset>
                  <legend className="mb-1.5 font-semibold text-slate-900">Label</legend>
                  <div className="flex flex-col">
                    {board.labels.map((l) => (
                      <label key={l.id} className="flex min-h-9 items-center gap-2 text-slate-800">
                        <input
                          type="checkbox"
                          checked={filters.labelIds.includes(l.id)}
                          onChange={() => set({ labelIds: toggle(filters.labelIds, l.id) })}
                          className="h-4 w-4"
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {board.milestones.length > 0 && (
                <div>
                  <label htmlFor="filter-milestone" className="mb-1.5 block font-semibold text-slate-900">Milestone</label>
                  <select
                    id="filter-milestone"
                    value={filters.milestoneId ?? ""}
                    onChange={(e) => set({ milestoneId: e.target.value ? Number(e.target.value) : null })}
                    className={`min-h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 ${FOCUS_LIGHT}`}
                  >
                    <option value="">Any milestone</option>
                    {board.milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              <fieldset>
                <legend className="mb-1.5 font-semibold text-slate-900">Due</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <label className="flex min-h-9 items-center gap-2 text-slate-800">
                    <input type="radio" name="due-filter" checked={filters.due === null} onChange={() => set({ due: null })} className="h-4 w-4" />
                    Any time
                  </label>
                  {DUE_OPTIONS.map((o) => (
                    <label key={o.value} className="flex min-h-9 items-center gap-2 text-slate-800">
                      <input type="radio" name="due-filter" checked={filters.due === o.value} onChange={() => set({ due: o.value })} className="h-4 w-4" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                disabled={activeMenuFilters === 0}
                onClick={() => set({ priorities: [], labelIds: [], milestoneId: null, due: null })}
                className={`${BUTTON_SECONDARY_COMPACT} w-full`}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>

        {onWorkload && (board.viewer.isLeader || board.viewer.readOnly) && (
          <button type="button" onClick={onWorkload} className={`${BUTTON_SECONDARY_COMPACT} ml-auto`}>
            Workload
          </button>
        )}

        {board.viewer.canCreate && (
          <button type="button" onClick={onNewTask} className={`${BUTTON_PRIMARY_COMPACT} ${onWorkload && (board.viewer.isLeader || board.viewer.readOnly) ? "" : "ml-auto"}`}>
            <PlusIcon className="h-4 w-4" />
            New task
          </button>
        )}
        {leaderMenu}
      </div>

      {line && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
          <span>{line}</span>
          {hasAnyFilter(filters) && (
            <button
              type="button"
              onClick={() => onChange(NO_FILTERS)}
              className={`rounded px-1.5 text-sm font-medium text-indigo-800 underline ${FOCUS_LIGHT}`}
            >
              Clear all
            </button>
          )}
        </p>
      )}
    </div>
  );
}
