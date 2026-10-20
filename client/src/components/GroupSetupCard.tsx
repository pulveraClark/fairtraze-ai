import { useId, useState, type FormEvent } from "react";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT, CARD, FOCUS_LIGHT } from "./ui/styles";
import { InfoTip } from "./ui/InfoTip";
import { TIPS, helpLink } from "../lib/helpText";
import {
  deriveSetupProgress,
  membersLinkedLine,
  repoFeedback,
  type GroupSetup,
  type SetupStep,
} from "../lib/groupSetup";

const LINK = `font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`;
const INPUT =
  `block w-full min-h-9 rounded-lg border bg-white px-3 py-1.5 font-mono text-sm text-slate-900 placeholder-slate-500 ${FOCUS_LIGHT}`;

/** Message of a failed save, taken from the server so the wording lives in one place. */
async function saveRepo(projectId: number, token: string | null, repoUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/groups/${projectId}/repo`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ repoUrl }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, message: body.error ?? "Could not save the link. Try again." };
  } catch {
    return { ok: false, message: "We couldn't reach the server. Check your connection and try again." };
  }
}

function StepMark({ step }: { step: SetupStep }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
        step.done ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-400 bg-white text-slate-700"
      }`}
    >
      {step.done ? "✓" : ({ create: "1", link: "2", usernames: "3" } as const)[step.id]}
    </span>
  );
}

function StepHeading({ step, children }: { step: SetupStep; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
      <span className={`text-xs font-medium ${step.done ? "text-emerald-800" : "text-slate-700"}`}>
        {step.done ? "Done" : "To do"}
      </span>
      {children}
    </div>
  );
}

function CreateStep({ step }: { step: SetupStep }) {
  return (
    <>
      <StepHeading step={step} />
      {!step.done && (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-800">
            <li>Sign in to GitHub and start a new repository.</li>
            <li>Give it a name. Choose Public so the link can be checked.</li>
            <li>Click Create repository.</li>
            <li>Copy the link from your browser's address bar.</li>
          </ol>
          <a
            href="https://github.com/new"
            target="_blank"
            rel="noopener noreferrer"
            className={`${BUTTON_SECONDARY_COMPACT} mt-2`}
          >
            Open GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </>
      )}
    </>
  );
}

function LinkStep({
  step, setup, projectId, token, onSaved,
}: {
  step: SetupStep; setup: GroupSetup; projectId: number; token: string | null; onSaved: () => void;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const canEdit = setup.canLinkRepo || (setup.canChangeRepo && editing);
  const feedback = repoFeedback(value, touched);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (feedback.kind !== "ok") return;
    setSaving(true);
    setServerError("");
    const result = await saveRepo(projectId, token, feedback.url);
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setValue("");
      setTouched(false);
      onSaved();
    } else {
      setServerError(result.message);
    }
  }

  return (
    <>
      <StepHeading step={step}>
        <InfoTip label="About the repository link" helpHref={helpLink("github-link")}>{TIPS.repoLink}</InfoTip>
      </StepHeading>

      {setup.repoLinked && !canEdit && (
        <p className="mt-1 break-all text-sm text-slate-800">
          <a className={`${LINK} font-mono`} href={setup.repoUrl ?? "#"} target="_blank" rel="noopener noreferrer">
            {(setup.repoUrl ?? "").replace("https://github.com/", "github.com/")}
          </a>
          {setup.canChangeRepo ? (
            <button type="button" onClick={() => setEditing(true)} className={`${BUTTON_SECONDARY_COMPACT} ml-2 align-middle`}>
              Change link
            </button>
          ) : (
            <span className="mt-1 block text-xs text-slate-700">Only the group leader can change it.</span>
          )}
        </p>
      )}

      {canEdit && (
        <form onSubmit={(e) => void submit(e)} noValidate className="mt-2 space-y-2">
          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-slate-900">Repository link</label>
            <input
              id={inputId}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={value}
              placeholder="https://github.com/owner/repo"
              disabled={saving}
              aria-invalid={feedback.kind === "error" || !!serverError}
              aria-describedby={hintId}
              onChange={(e) => { setValue(e.target.value); setServerError(""); }}
              onBlur={() => setTouched(true)}
              className={`${INPUT} mt-1 ${feedback.kind === "error" || serverError ? "border-red-700" : "border-slate-400"}`}
            />
            <p id={hintId} className="mt-1 text-xs text-slate-700" aria-live="polite">
              {feedback.kind === "ok" && <span className="font-medium text-emerald-800">✓ Looks right: {feedback.shown}</span>}
              {feedback.kind === "error" && <span className="font-medium text-red-800">{feedback.message}</span>}
              {feedback.kind === "empty" && "Example: https://github.com/owner/repo"}
            </p>
          </div>
          {serverError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">{serverError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || feedback.kind !== "ok"} className={BUTTON_PRIMARY_COMPACT}>
              {saving ? "Checking GitHub…" : setup.repoLinked ? "Save new link" : "Save link"}
            </button>
            {editing && (
              <button type="button" disabled={saving} onClick={() => { setEditing(false); setValue(""); setTouched(false); setServerError(""); }} className={BUTTON_SECONDARY_COMPACT}>
                Cancel
              </button>
            )}
          </div>
          {setup.repoLinked && (
            <p className="text-xs text-slate-700">Changing the link tells your group and your instructor.</p>
          )}
        </form>
      )}
    </>
  );
}

function UsernamesStep({ step, setup }: { step: SetupStep; setup: GroupSetup }) {
  const u = setup.usernames;
  return (
    <>
      <StepHeading step={step}>
        <InfoTip label="About GitHub usernames" helpHref={helpLink("github-link")}>{TIPS.githubUsername}</InfoTip>
      </StepHeading>
      <p className="mt-1 text-sm tabular-nums text-slate-800">{membersLinkedLine(u)}</p>
      {u.missingNames.length > 0 && (
        <p className="mt-0.5 text-sm text-slate-800">
          Still to add: <span className="font-medium">{u.missingNames.join(", ")}</span>
        </p>
      )}
      {!setup.viewerHasGithubUsername && (
        <a href="/settings?edit=github" className={`${BUTTON_PRIMARY_COMPACT} mt-2`}>Add my GitHub username</a>
      )}
      {setup.viewerHasGithubUsername && !step.done && (
        <p className="mt-1 text-xs text-slate-700">Your username is added. Each member adds their own in Settings.</p>
      )}
    </>
  );
}

/** "Set up your group": 3 steps with a progress indicator. Renders nothing for a Docs-only or finished group. */
export function GroupSetupCard({
  projectId, setup, token, onSaved,
}: {
  projectId: number; setup: GroupSetup; token: string | null; onSaved: () => void;
}) {
  const progress = deriveSetupProgress(setup);
  if (!setup.needsRepo || progress.complete) return null;

  return (
    <section aria-labelledby="group-setup-title" className={`${CARD} mb-6 p-4`} data-setup-state={progress.state}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="group-setup-title" className="text-base font-semibold text-slate-900">Set up your group</h2>
        <p className="text-sm font-medium tabular-nums text-slate-800">{progress.label}</p>
      </div>
      <div
        role="progressbar"
        aria-label="Group setup progress"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.doneCount}
        aria-valuetext={progress.label}
        className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-emerald-700" style={{ width: `${(progress.doneCount / progress.total) * 100}%` }} />
      </div>

      <ol className="mt-4 space-y-4">
        {progress.steps.map((step) => (
          <li key={step.id} className="flex gap-3">
            <StepMark step={step} />
            <div className="min-w-0 flex-1">
              {step.id === "create" && <CreateStep step={step} />}
              {step.id === "link" && <LinkStep step={step} setup={setup} projectId={projectId} token={token} onSaved={onSaved} />}
              {step.id === "usernames" && <UsernamesStep step={step} setup={setup} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
