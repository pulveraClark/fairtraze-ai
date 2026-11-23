import { FOCUS_LIGHT } from "./ui/styles";

/** One calm line. Renders nothing when there is nothing useful to say (the caller passes null). */
export function NextStepLine({ text, onOpenTasks }: { text: string | null; onOpenTasks?: () => void }) {
  if (!text) return null;
  return (
    <p
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800"
    >
      <span className="font-semibold text-slate-900">Next step</span>
      <span>{text}</span>
      {onOpenTasks && (
        <button
          type="button"
          onClick={onOpenTasks}
          className={`ft-hit rounded px-1 font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`}
        >
          Open tasks
        </button>
      )}
    </p>
  );
}
