import { Modal } from "./ui/Modal";
import { InfoTip } from "./ui/InfoTip";
import { BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY_COMPACT } from "./ui/styles";
import { TIPS, helpLink } from "../lib/helpText";

export interface RoleMeta { label: string; activeClass: string; inactiveClass: string }

export interface RoleSuggestionView {
  status: string;
  suggestedRoles: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The "Change" button that opened the dialog; focus returns here. */
  restoreFocusTo: HTMLElement | null;
  roleMeta: Record<string, RoleMeta>;
  sourceType: string;
  myRoles: string[];
  suggestion: RoleSuggestionView | null;
  draft: string[];
  onDraftChange: (next: string[]) => void;
  busy: boolean;
  error: string;
  onSubmit: () => void;
}

/** True when the member can suggest a role (or has one waiting), i.e. when "Change" has something to open. */
export function canSuggestRole(role: string, sourceType: string, suggestion: RoleSuggestionView | null): boolean {
  return role === "MEMBER" && (sourceType === "COMBINED" || suggestion?.status === "PENDING");
}

/** The role box of the student report page, as a dialog: assigned role (read-only) and the suggestion flow. */
export function RoleModal({
  open, onClose, restoreFocusTo, roleMeta, sourceType, myRoles, suggestion, draft, onDraftChange, busy, error, onSubmit,
}: Props) {
  const pending = suggestion?.status === "PENDING";
  const unchanged = JSON.stringify([...draft].sort()) === JSON.stringify([...myRoles].sort());
  return (
    <Modal open={open} onClose={onClose} title="Your role" size="md" restoreFocusTo={restoreFocusTo}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-xs text-slate-600">
            Assigned by your leader
            <InfoTip label="About roles" helpHref={helpLink("roles")}>{TIPS.roles}</InfoTip>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {myRoles.length === 0 ? (
              <span className="text-xs italic text-slate-600">No role assigned yet</span>
            ) : (
              myRoles.map((role) => {
                const meta = roleMeta[role];
                if (!meta) return null;
                return (
                  <span key={role} className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs font-medium ${meta.activeClass}`}>
                    ✓ {meta.label}
                  </span>
                );
              })
            )}
          </div>
        </div>

        <p className="text-xs text-slate-600">Roles are context only. They never change a score.</p>

        <div className="border-t border-slate-100 pt-3">
          {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}

          {pending ? (
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                PENDING
              </span>
              <p className="text-xs leading-relaxed text-slate-600">
                Your suggestion (
                <span className="font-medium">
                  {suggestion!.suggestedRoles.map((r) => roleMeta[r]?.label ?? r).join(" + ")}
                </span>
                ) is awaiting your leader's approval.
              </p>
            </div>
          ) : (
            <>
              {suggestion?.status === "ACCEPTED" && (
                <p className="mb-2 text-xs text-emerald-600">✓ Your last suggestion was accepted.</p>
              )}
              {suggestion?.status === "DECLINED" && (
                <p className="mb-2 text-xs text-red-600">Your last suggestion was declined. You can suggest again.</p>
              )}
              <p className="mb-2 text-xs text-slate-600">Suggest a role to your leader for approval:</p>
              <div role="group" aria-label="Roles to suggest" className="mb-3 flex flex-wrap items-center gap-2">
                {Object.keys(roleMeta)
                  .filter((role) => {
                    if (sourceType === "GITHUB") return role === "DEVELOPER";
                    if (sourceType === "EDITOR") return role === "DOCUMENTATION";
                    return true;
                  })
                  .map((role) => {
                    const selected = draft.includes(role);
                    const meta = roleMeta[role]!;
                    const next = selected ? draft.filter((r) => r !== role) : [...draft, role];
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={selected}
                        disabled={busy}
                        onClick={() => onDraftChange(next)}
                        className={`min-h-10 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 ${
                          selected ? meta.activeClass : meta.inactiveClass
                        }`}
                      >
                        {selected ? `✓ ${meta.label}` : meta.label}
                      </button>
                    );
                  })}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Cancel</button>
          {!pending && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || draft.length === 0 || unchanged}
              className={`${BUTTON_PRIMARY_COMPACT} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {busy ? "Submitting…" : "Submit suggestion →"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
