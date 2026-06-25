import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { GroupManageModal } from "../components/GroupManageModal";

// ── Constants ─────────────────────────────────────────────────────────────────
const HEALTH_BADGE: Record<string, string> = {
  "Healthy":       "text-emerald-700 bg-emerald-50 border-emerald-200",
  "Moderate Risk": "text-amber-700 bg-amber-50 border-amber-200",
  "High Risk":     "text-red-700 bg-red-50 border-red-200",
};

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "GitHub + Docs",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface MyGroup {
  id: number;
  groupName: string;
  name: string;
  repoUrl: string;
  role: "LEADER" | "MEMBER";
  pendingRequestCount: number;
  report: { gini: number | null; teamHealth: string | null; generatedAt: string } | null;
}

interface MyRequest {
  id: number;
  projectId: number;
  groupName: string;
  status: "PENDING" | "DECLINED";
  createdAt: string;
}

interface AvailableGroup {
  id: number;
  groupName: string;
  memberCount: number;
  leaderName: string | null;
  isFull: boolean;
}

interface AssignmentDetail {
  id: number;
  title: string;
  deadline: string | null;
  sourceType: string;
  maxGroupSize: number;
  myGroup: MyGroup | null;
  myRequest: MyRequest | null;
  groups: AvailableGroup[];
}

interface ClassDetail {
  classSection: {
    id: number;
    subjectCode: string;
    subjectName: string;
    course: string;
    edpCode: string;
    joinCode: string | null;
  };
  assignments: AssignmentDetail[];
}

// ── Copyable join code badge ──────────────────────────────────────────────────
function JoinCodeBadge({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
      <span className="text-[10px] text-slate-400 shrink-0">Class code:</span>
      <span className="font-mono font-bold text-[11px] text-indigo-700 tracking-wider select-all">{code}</span>
      <button
        onClick={() => void handleCopy()}
        title={copied ? "Copied!" : "Copy class join code"}
        className={`p-0.5 rounded transition-colors ${copied ? "text-emerald-600" : "text-slate-300 hover:text-indigo-500"}`}
      >
        {copied ? (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ── Project card — shows one assignment with create/join or group view ─────────
function ProjectCard({
  asgn,
  token,
  user,
  onNavigate,
  onManage,
  onChanged,
  refreshUser,
}: {
  asgn: AssignmentDetail;
  token: string | null;
  user: { githubUsername?: string | null } | null;
  onNavigate: (projectId: number, tab?: string) => void;
  onManage:   (projectId: number) => void;
  onChanged:  () => void;
  refreshUser: () => Promise<{ githubUsername?: string | null } | null>;
}) {
  const [mode, setMode]             = useState<"idle" | "create" | "join">("idle");
  const [groupName, setGroupName]   = useState("");
  const [repoUrl, setRepoUrl]       = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const needsGitHub = asgn.sourceType === "GITHUB" || asgn.sourceType === "COMBINED";
  const noGithub    = needsGitHub && !user?.githubUsername;
  const isPending   = asgn.myRequest?.status === "PENDING";

  async function handleCreate() {
    if (!groupName.trim()) { setError("Enter a group name."); return; }
    if (needsGitHub && !repoUrl.trim()) { setError("Enter the GitHub repository URL."); return; }
    const fresh = await refreshUser();
    const githubUsername = fresh?.githubUsername ?? user?.githubUsername;
    if (needsGitHub && !githubUsername) {
      setError("Add your GitHub username in Settings before creating a group.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/join/create-group", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ assignmentId: asgn.id, groupName: groupName.trim(), repoUrl: repoUrl.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Could not create group."); return; }
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequest() {
    if (!selectedId) { setError("Select a group to request."); return; }
    const fresh = await refreshUser();
    const githubUsername = fresh?.githubUsername ?? user?.githubUsername;
    if (needsGitHub && !githubUsername) {
      setError("Add your GitHub username in Settings before requesting to join a group.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/groups/${selectedId}/request`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({}),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "Could not send request."); return; }
      onChanged();
    } finally {
      setSubmitting(false);
    }
  }

  function fmtDeadline(iso: string | null): string {
    if (!iso) return "No deadline";
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-5 pt-5 pb-3 border-b border-slate-100">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-800 leading-snug">{asgn.title}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 uppercase tracking-wide">
                {SOURCE_LABEL[asgn.sourceType] ?? asgn.sourceType}
              </span>
              <span className="text-[11px] text-slate-400">
                {fmtDeadline(asgn.deadline)}
              </span>
              <span className="text-[11px] text-slate-400">
                Max {asgn.maxGroupSize} per group
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4">
        {/* Student is already in a group */}
        {asgn.myGroup ? (() => {
          const g = asgn.myGroup!;
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  g.role === "LEADER"
                    ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                    : "text-slate-500 bg-white border-slate-200"
                }`}>
                  {g.role === "LEADER" ? "Leader" : "Member"}
                </span>
                <span className="text-sm font-semibold text-slate-700">{g.groupName}</span>
                {g.report?.teamHealth && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${HEALTH_BADGE[g.report.teamHealth] ?? "text-slate-500 bg-slate-50 border-slate-200"}`}>
                    {g.report.teamHealth}
                  </span>
                )}
              </div>

              {!g.report && (
                <p className="text-[11px] text-slate-400 italic">No analysis yet — awaiting instructor.</p>
              )}

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {g.role === "LEADER" && (
                  <button
                    onClick={() => onManage(g.id)}
                    className="relative inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                  >
                    Manage group
                    {g.pendingRequestCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold px-1 leading-none">
                        {g.pendingRequestCount}
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={() => onNavigate(g.id)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50"
                >
                  View report →
                </button>
                {(asgn.sourceType === "EDITOR" || asgn.sourceType === "COMBINED") && (
                  <button
                    onClick={() => onNavigate(g.id, "document")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 transition-colors border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50"
                  >
                    FairTraze Docs
                    <span className="text-[9px] font-bold text-violet-400">Preview</span>
                  </button>
                )}
              </div>
            </div>
          );
        })() : isPending ? (
          /* Pending request — waiting for leader approval */
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-3">
              <span className="shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">
                  Request pending — {asgn.myRequest!.groupName}
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Waiting for the group leader to respond. You will be notified when your request is accepted or declined.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Student has no group yet — show create/join UI */
          <div className="space-y-3">
            {/* Declined request notification */}
            {asgn.myRequest?.status === "DECLINED" && (
              <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3.5 py-2.5">
                <svg className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-red-700">
                  Your request to join <strong>{asgn.myRequest.groupName}</strong> was declined. You can request another group.
                </p>
              </div>
            )}

            {/* GitHub warning if needed */}
            {noGithub && mode !== "idle" && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 leading-relaxed">
                <strong>GitHub username required for this project.</strong>{" "}
                <a href="/settings" className="underline font-semibold hover:text-amber-900">Add it in Settings</a> first.
              </div>
            )}

            {/* Idle: action buttons */}
            {mode === "idle" && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { setMode("create"); setError(""); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create group
                </button>
                {asgn.groups.filter((g) => !g.isFull).length > 0 && (
                  <button
                    onClick={() => { setMode("join"); setError(""); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    Request to join a group
                  </button>
                )}
                {asgn.groups.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic">No groups yet — be the first to create one.</p>
                )}
              </div>
            )}

            {/* Create group form */}
            {mode === "create" && (
              <div className="space-y-2">
                <input
                  value={groupName}
                  onChange={(e) => { setGroupName(e.target.value); setError(""); }}
                  placeholder="Group name — e.g. Group 1"
                  disabled={submitting}
                  className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {needsGitHub && (
                  <input
                    value={repoUrl}
                    onChange={(e) => { setRepoUrl(e.target.value); setError(""); }}
                    placeholder="GitHub repo URL — e.g. github.com/org/repo"
                    disabled={submitting}
                    className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                )}
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleCreate()}
                    disabled={submitting || noGithub}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Creating…" : "Create Group"}
                  </button>
                  <button
                    onClick={() => { setMode("idle"); setError(""); setGroupName(""); setRepoUrl(""); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Leadership is administrative only — it grants no contribution credit.
                </p>
              </div>
            )}

            {/* Request to join group form */}
            {mode === "join" && (
              <div className="space-y-2">
                {asgn.groups.filter((g) => !g.isFull).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">All groups are full.</p>
                ) : (
                  <div className="space-y-1.5">
                    {asgn.groups.map((g) => (
                      <label
                        key={g.id}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                          g.isFull
                            ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200"
                            : selectedId === g.id
                            ? "bg-indigo-50 border-indigo-300 cursor-pointer"
                            : "bg-slate-50 border-slate-200 hover:border-slate-300 cursor-pointer"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`join-${asgn.id}`}
                          value={g.id}
                          disabled={g.isFull}
                          checked={selectedId === g.id}
                          onChange={() => { setSelectedId(g.id); setError(""); }}
                          className="shrink-0"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-slate-700">{g.groupName}</span>
                          <span className="text-[11px] text-slate-400 ml-2">
                            {g.memberCount} / {asgn.maxGroupSize} members
                          </span>
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {g.isFull ? "Full" : g.leaderName ? `Leader: ${g.leaderName}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {error && <p className="text-xs text-red-600">{error}</p>}
                <p className="text-[10px] text-slate-400">
                  The group leader must approve your request before you are added.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void handleRequest()}
                    disabled={submitting || !selectedId || noGithub}
                    className="flex-1 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Sending…" : "Send Request"}
                  </button>
                  <button
                    onClick={() => { setMode("idle"); setError(""); setSelectedId(null); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface Props { classId: number }

export function StudentClassPage({ classId }: Props) {
  const { user, token, refreshUser } = useAuth();
  const { navigate }                 = useRouter();

  const [detail, setDetail]           = useState<ClassDetail | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [refreshKey, setRefreshKey]   = useState(0);
  const [managingProjectId, setManagingProjectId] = useState<number | null>(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveLoading, setLeaveLoading]     = useState(false);
  const [leaveError, setLeaveError]         = useState("");

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError("");
    fetch(`/api/student/classes/${classId}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = (await res.json()) as ClassDetail & { error?: string };
        if (!res.ok) { setError(data.error ?? "Could not load class."); return; }
        setDetail(data);
      })
      .catch(() => setError("Network error — is the server running?"))
      .finally(() => setLoading(false));
  }, [token, classId, refreshKey]);

  async function handleLeaveClass() {
    setLeaveLoading(true);
    setLeaveError("");
    try {
      const res  = await fetch(`/api/student/classes/${classId}/leave`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setLeaveError(data.error ?? "Could not leave class."); return; }
      navigate("/student");
    } catch {
      setLeaveError("Network error — could not leave class.");
    } finally {
      setLeaveLoading(false);
    }
  }

  const cls = detail?.classSection;
  const assignments = detail?.assignments ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {managingProjectId !== null && (
        <GroupManageModal
          projectId={managingProjectId}
          isInstructor={false}
          onClose={() => setManagingProjectId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Leave class?</h2>
              {cls && <p className="text-xs text-slate-400 mt-0.5">{cls.subjectName}</p>}
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 leading-relaxed">
                You will be removed from all groups in this class.{" "}
                <strong>Any group you lead alone will be permanently deleted.</strong>{" "}
                This cannot be undone.
              </div>
              {leaveError && <p className="text-xs text-red-600">{leaveError}</p>}
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={() => { setShowLeaveModal(false); setLeaveError(""); }}
                  disabled={leaveLoading}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleLeaveClass()}
                  disabled={leaveLoading}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {leaveLoading ? "Leaving…" : "Leave class"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={() => navigate("/student")}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
            >
              Dashboard
            </button>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <div className="min-w-0">
              {cls ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-indigo-600">
                    {cls.subjectCode}
                    {cls.edpCode && <span className="font-semibold text-indigo-400"> · EDP {cls.edpCode}</span>}
                  </span>
                  <h1 className="text-sm font-semibold text-slate-800">{cls.subjectName}</h1>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                    {cls.course}
                  </span>
                </div>
              ) : (
                <h1 className="text-sm font-semibold text-slate-400">{loading ? "Loading…" : "Class"}</h1>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                {assignments.length} project{assignments.length !== 1 ? "s" : ""}
                {" · "}
                {assignments.filter((a) => a.myGroup !== null).length} joined
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Join code — always shown in header */}
            {cls?.joinCode && <JoinCodeBadge code={cls.joinCode} />}
            <button
              onClick={() => setShowLeaveModal(true)}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Leave class
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-8 py-8">

        {loading && (
          <div className="flex items-center gap-3 py-16 text-slate-400 text-sm justify-center">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            Loading projects…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && assignments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No projects yet</p>
              <p className="text-xs text-slate-400 mt-1">Your instructor hasn't created any projects for this class.</p>
            </div>
          </div>
        )}

        {!loading && !error && assignments.length > 0 && (
          <>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {assignments.map((asgn) => (
                <ProjectCard
                  key={asgn.id}
                  asgn={asgn}
                  token={token}
                  user={user}
                  onNavigate={(projectId, tab) => navigate(`/student/group/${projectId}${tab ? `?tab=${tab}` : ""}`)}
                  onManage={(projectId) => setManagingProjectId(projectId)}
                  onChanged={() => setRefreshKey((k) => k + 1)}
                  refreshUser={refreshUser}
                />
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button
            onClick={() => navigate("/overview")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            System Overview →
          </button>
        </div>
      </footer>
    </div>
  );
}
