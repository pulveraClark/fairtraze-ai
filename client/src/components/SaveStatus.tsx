import { SAVE_STATE_TEXT, type SaveState } from "../lib/saveState";

/** Calm save status beside the editor title. The live region stays mounted so changes are announced politely. */
export function SaveStatus({ state }: { state: SaveState | null }) {
  const tone = state === "offline" ? "text-amber-800" : "text-slate-700";
  return (
    <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 text-xs ${tone}`} data-save-state={state ?? "none"}>
      {state && (
        <>
          <SaveIcon state={state} />
          {SAVE_STATE_TEXT[state]}
        </>
      )}
    </span>
  );
}

function SaveIcon({ state }: { state: SaveState }) {
  const common = { className: "h-3.5 w-3.5 shrink-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2.5, "aria-hidden": true } as const;
  if (state === "saved") return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
  if (state === "offline") return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>;
  // connecting / saving: circular arrows (no animation, so reduced-motion needs no special case)
  return <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M5.6 15A8 8 0 0018.4 9" /></svg>;
}
