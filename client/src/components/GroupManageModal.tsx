import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";

// ── Types ─────────────────────────────────────────────────────────────────────
interface GroupMember {
  userId: number;
  name: string;
  email: string;
  githubUsername: string | null;
  role: "LEADER" | "MEMBER";
  joinedAt: string;
}

interface GroupDetail {
  id: number;
  groupName: string;
  name: string;
  repoUrl: string;
  sourceType: "GITHUB" | "EDITOR" | "COMBINED" | null;
  maxGroupSize: number | null;
  members: GroupMember[];
}

type Step =
  | "list"
  | "reassign-select"
  | { type: "confirm-reassign"; userId: number; name: string }
  | { type: "confirm-remove";   userId: number; name: string };

interface Props {
  projectId: number;
  isInstructor: boolean;
  onClose: () => void;
  onChanged: () => void;
}

// ── Helper: initials avatar ───────────────────────────────────────────────────
function Initials({ name, leader }: { name: string; leader: boolean }) {
  const ini = name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <span
      className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold select-none ${
        leader
          ? "bg-indigo-100 text-indigo-700 border border-indigo-200"
          : "bg-slate-100 text-slate-600 border border-slate-200"
      }`}
    >
      {ini}
    </span>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function GroupManageModal({ projectId, isInstructor, onClose, onChanged }: Props) {
  const { user, token } = useAuth();
  const { navigate }    = useRouter();

  const [group, setGroup]       = useState<GroupDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [step, setStep]         = useState<Step>("list");
  const [busy, setBusy]         = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [reassignTarget, setReassignTarget] = useState<number | null>(null);

  const currentUserId = user?.id ?? 0;

  async function fetchGroup() {
    setLoading(true);
    setFetchErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string } & Partial<GroupDetail>;
      if (!res.ok) { setFetchErr(data.error ?? "Could not load group."); return; }
      setGroup(data as GroupDetail);
    } catch {
      setFetchErr("Network error — could not load group.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchGroup();
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myMembership = group?.members.find((m) => m.userId === currentUserId);
  const amLeader     = myMembership?.role === "LEADER";
  const canManage    = isInstructor || amLeader;

  // ── Reassign leader ────────────────────────────────────────────────────────
  async function handleReassign() {
    if (!reassignTarget) return;
    setBusy(true);
    setActionErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}/reassign-leader`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ userId: reassignTarget }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setActionErr(data.error ?? "Could not reassign leader."); return; }
      onChanged();
      setStep("list");
      setReassignTarget(null);
      await fetchGroup();
    } finally {
      setBusy(false);
    }
  }

  // ── Remove / leave ─────────────────────────────────────────────────────────
  async function handleRemove(targetUserId: number) {
    const isSelf = targetUserId === currentUserId;
    setBusy(true);
    setActionErr("");
    try {
      const res  = await fetch(`/api/groups/${projectId}/members/${targetUserId}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setActionErr(data.error ?? "Could not remove member."); setStep("list"); return; }
      onChanged();
      if (isSelf) {
        onClose();
      } else {
        setStep("list");
        await fetchGroup();
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  function renderList() {
    if (!group) return null;
    const nonLeaderMembers = group.members.filter((m) => m.role !== "LEADER");

    return (
      <>
        <p className="text-[11px] text-slate-400 mb-4">
          {group.members.length}
          {group.maxGroupSize ? ` / ${group.maxGroupSize}` : ""} members
          {group.repoUrl && (
            <> · <span className="font-mono">{group.repoUrl.replace("https://github.com/", "")}</span></>
          )}
        </p>

        {actionErr && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {actionErr}
          </div>
        )}

        <ul className="space-y-2">
          {group.members.map((m) => {
            const isSelf      = m.userId === currentUserId;
            const isThisLeader = m.role === "LEADER";

            return (
              <li
                key={m.userId}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50"
              >
                <Initials name={m.name} leader={isThisLeader} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-800 truncate">
                      {m.name}{isSelf && <span className="text-slate-400 font-normal"> (you)</span>}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                      isThisLeader
                        ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                        : "text-slate-500 bg-white border-slate-200"
                    }`}>
                      {isThisLeader ? "Leader" : "Member"}
                    </span>
                  </div>
                  {m.githubUsername && (
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">@{m.githubUsername}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isSelf && isThisLeader && (
                    <span className="text-[10px] text-slate-400">Reassign to leave</span>
                  )}
                  {isSelf && !isThisLeader && (
                    <button
                      onClick={() => setStep({ type: "confirm-remove", userId: m.userId, name: m.name })}
                      className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Leave
                    </button>
                  )}
                  {!isSelf && canManage && !isThisLeader && (
                    <button
                      onClick={() => setStep({ type: "confirm-remove", userId: m.userId, name: m.name })}
                      className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Change leader — only shown if canManage and there are other members to promote */}
        {canManage && nonLeaderMembers.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={() => { setStep("reassign-select"); setReassignTarget(null); setActionErr(""); }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Change leader
            </button>
            <p className="text-[10px] text-slate-400 mt-1">
              Leadership is administrative only — it grants no contribution credit.
            </p>
          </div>
        )}

        {canManage && nonLeaderMembers.length === 0 && amLeader && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">
              You are the only member. Contact your instructor if you need to leave this group.
            </p>
          </div>
        )}
      </>
    );
  }

  function renderReassignSelect() {
    if (!group) return null;
    const candidates = group.members.filter((m) => m.role !== "LEADER");
    return (
      <>
        <p className="text-xs text-slate-500 mb-4">Select the member to promote to group leader:</p>

        {actionErr && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {actionErr}
          </div>
        )}

        <div className="space-y-1.5 mb-5">
          {candidates.map((m) => (
            <label
              key={m.userId}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                reassignTarget === m.userId
                  ? "bg-indigo-50 border-indigo-300"
                  : "bg-slate-50 border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="leader"
                checked={reassignTarget === m.userId}
                onChange={() => setReassignTarget(m.userId)}
                className="shrink-0 accent-indigo-500"
              />
              <Initials name={m.name} leader={false} />
              <span className="text-xs font-medium text-slate-700">
                {m.name}
                {m.userId === currentUserId && <span className="text-slate-400"> (you)</span>}
              </span>
              {m.githubUsername && (
                <span className="text-[11px] text-slate-400 font-mono ml-auto">@{m.githubUsername}</span>
              )}
            </label>
          ))}
        </div>

        <p className="text-[10px] text-slate-400 mb-4">
          Leadership is administrative only. The new leader is scored on their actual work, the same as every other member.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setStep("list"); setReassignTarget(null); setActionErr(""); }}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!reassignTarget) return;
              const target = group.members.find((m) => m.userId === reassignTarget);
              if (target) setStep({ type: "confirm-reassign", userId: target.userId, name: target.name });
            }}
            disabled={!reassignTarget || busy}
            className="px-4 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold disabled:bg-slate-200 disabled:text-slate-400"
          >
            Continue →
          </button>
        </div>
      </>
    );
  }

  function renderConfirmReassign(targetUserId: number, targetName: string) {
    return (
      <>
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-relaxed mb-5">
          <strong>{targetName}</strong> will become the new group leader.
          {amLeader && !isInstructor && (
            <> You will be demoted to a regular member.</>
          )}
        </div>

        {actionErr && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {actionErr}
          </div>
        )}

        <p className="text-[11px] text-slate-400 mb-5">
          Leadership is administrative only and grants no contribution credit. Scores are based on actual work.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setStep("reassign-select"); setActionErr(""); }}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={() => void (async () => {
              setReassignTarget(targetUserId);
              await handleReassign();
            })()}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold disabled:opacity-50"
          >
            {busy ? "Reassigning…" : "Confirm reassignment"}
          </button>
        </div>
      </>
    );
  }

  function renderConfirmRemove(targetUserId: number, targetName: string) {
    const isSelf = targetUserId === currentUserId;
    return (
      <>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 leading-relaxed mb-5">
          {isSelf
            ? <>Are you sure you want to <strong>leave this group</strong>? You will need to rejoin using the join code.</>
            : <>Are you sure you want to remove <strong>{targetName}</strong> from this group? They will need to rejoin using the join code.</>
          }
        </div>

        {actionErr && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700">
            {actionErr}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={() => { setStep("list"); setActionErr(""); }}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleRemove(targetUserId)}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-white bg-red-600 hover:bg-red-700 transition-colors font-semibold disabled:opacity-50"
          >
            {busy
              ? (isSelf ? "Leaving…" : "Removing…")
              : (isSelf ? "Leave group" : `Remove ${targetName}`)
            }
          </button>
        </div>
      </>
    );
  }

  // ── Title per step ─────────────────────────────────────────────────────────
  function stepTitle() {
    if (step === "list")            return "Manage Group";
    if (step === "reassign-select") return "Change Leader";
    if (typeof step === "object" && step.type === "confirm-reassign") return "Confirm Leader Change";
    if (typeof step === "object" && step.type === "confirm-remove")   return "Are you sure?";
    return "Manage Group";
  }

  // ── No GitHub username nudge (only relevant for GITHUB / COMBINED projects) ──
  const githubRequired = group?.sourceType === "GITHUB" || group?.sourceType === "COMBINED";
  const needsGitHub    = githubRequired && !user?.githubUsername;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{stepTitle()}</h2>
            {group && (
              <p className="text-xs text-slate-400 mt-0.5">{group.groupName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-slate-400">
              <span className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
              Loading members…
            </div>
          )}

          {!loading && fetchErr && (
            <p className="text-sm text-red-600 py-4 text-center">{fetchErr}</p>
          )}

          {!loading && !fetchErr && group && (
            <>
              {needsGitHub && step === "list" && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800">
                  <strong>GitHub username not set.</strong>{" "}
                  <button
                    onClick={() => { onClose(); navigate("/settings"); }}
                    className="underline font-semibold hover:text-amber-900"
                  >
                    Add it in Settings
                  </button>{" "}
                  so your contributions can be tracked.
                </div>
              )}

              {step === "list" && renderList()}
              {step === "reassign-select" && renderReassignSelect()}
              {typeof step === "object" && step.type === "confirm-reassign" &&
                renderConfirmReassign(step.userId, step.name)}
              {typeof step === "object" && step.type === "confirm-remove" &&
                renderConfirmRemove(step.userId, step.name)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
