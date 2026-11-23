import { useRef } from "react";
import { TASK_VIEWS, TASK_VIEW_LABELS, type TaskView } from "../../lib/tasks/view";
import { FOCUS_LIGHT } from "../ui/styles";

interface Props {
  view: TaskView;
  onChange: (view: TaskView) => void;
}

/** Board / List / Calendar. A segmented radio group: arrow keys move and select, one tab stop. */
export function ViewSwitch({ view, onChange }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TASK_VIEWS[(index + step + TASK_VIEWS.length) % TASK_VIEWS.length]!;
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Tasks view" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {TASK_VIEWS.map((v, i) => {
        const selected = v === view;
        return (
          <button
            key={v}
            ref={(el) => { refs.current[v] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`min-h-8 rounded-md px-3 text-sm font-semibold ${FOCUS_LIGHT} ${
              selected ? "bg-indigo-700 text-white" : "text-slate-800 hover:bg-slate-100"
            }`}
          >
            {TASK_VIEW_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}
