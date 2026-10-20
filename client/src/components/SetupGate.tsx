import { GroupSetupCard } from "./GroupSetupCard";
import type { GroupSetup } from "../lib/groupSetup";

/** The leader's first-visit screen: the setup steps before the tabs, with a way to skip. */
export function SetupGate({ groupName, projectId, setup, token, onSaved, onSkip, onBack }: {
  groupName: string; projectId: number; setup: GroupSetup; token: string | null;
  onSaved: () => void; onSkip: () => void; onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="mx-auto w-full max-w-xl flex-1 px-6 py-10">
        <button type="button" onClick={onBack} className="mb-4 text-sm text-slate-700 underline underline-offset-2">Back to my classes</button>
        <h1 className="text-xl font-semibold text-slate-900">Set up {groupName}</h1>
        <p className="mb-4 mt-1 text-sm text-slate-800">Your group needs a GitHub repository before analysis can read any activity. It takes a minute.</p>
        <GroupSetupCard projectId={projectId} setup={setup} token={token} onSaved={onSaved} />
        <button type="button" onClick={onSkip} className="text-sm font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900">
          Do this later
        </button>
        <p className="mt-1 text-xs text-slate-700">You can finish setup any time from the bar at the top of your group.</p>
      </main>
    </div>
  );
}
