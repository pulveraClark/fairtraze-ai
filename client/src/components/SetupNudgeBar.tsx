import { useState } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";
import { setupNudge, type GroupSetup } from "../lib/groupSetup";
import { GroupSetupCard } from "./GroupSetupCard";
import { BUTTON_SECONDARY_COMPACT } from "./ui/styles";

/** The full setup steps in a dialog (focus trap, Esc closes). */
function SetupDialog({ projectId, setup, token, onSaved, onClose }: {
  projectId: number; setup: GroupSetup; token: string | null; onSaved: () => void; onClose: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Finish group setup"
        onClick={(e) => e.stopPropagation()}
        className="mt-10 w-full max-w-xl rounded-xl bg-slate-50 p-4"
      >
        <GroupSetupCard projectId={projectId} setup={setup} token={token} onSaved={onSaved} />
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * One slim line above the tabs while setup is incomplete: progress, the viewer's own next action and a
 * "Finish setup" button. It does not depend on the leader's "Do this later" choice.
 */
export function SetupNudgeBar({ projectId, setup, token, onSaved }: {
  projectId: number; setup: GroupSetup | undefined; token: string | null; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const nudge = setup ? setupNudge(setup) : null;
  if (!setup || !nudge) return null;
  return (
    <>
      <div data-setup-nudge className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 py-2">
        <p className="min-w-0 text-sm text-slate-800">
          <span className="font-semibold tabular-nums">{nudge.label}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">: </span>
          {nudge.action}
        </p>
        <button type="button" onClick={() => setOpen(true)} className={BUTTON_SECONDARY_COMPACT}>Finish setup</button>
      </div>
      {open && (
        <SetupDialog projectId={projectId} setup={setup} token={token} onSaved={onSaved} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
