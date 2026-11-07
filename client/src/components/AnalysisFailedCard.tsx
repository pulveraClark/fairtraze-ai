import { FOCUS_LIGHT } from "./ui/styles";

/** The red card shown on a group's report page when an analysis did not finish: what happened and what to do. */
export function AnalysisFailedCard({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-red-900">Analysis failed</p>
        <p className="break-words text-base leading-normal text-red-900">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-red-900 hover:bg-red-100 ${FOCUS_LIGHT}`}
      >
        &times;
      </button>
    </div>
  );
}
