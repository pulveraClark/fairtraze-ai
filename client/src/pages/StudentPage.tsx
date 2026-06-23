import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { GroupManageModal } from "../components/GroupManageModal";

// ── Gradient palette (matches instructor ClassCard) ───────────────────────────
const BAND_GRADIENTS = [
  "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #be123c 0%, #f43f5e 100%)",
  "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)",
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BAND_GRADIENTS[h % BAND_GRADIENTS.length];
}

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
interface Enrollment {
  classSection: {
    id: number;
    subjectCode: string;
    subjectName: string;
    course: string;
    edpCode: string;
  };
  assignment: {
    id: number;
    title: string;
    deadline: string | null;
    sourceType: string;
  };
  project: {
    id: number;
    groupName: string;
    name: string;
    repoUrl: string;
  };
  membership: {
    role: "LEADER" | "MEMBER";
    joinedAt: string;
  };
  report: {
    gini: number | null;
    teamHealth: string | null;
    generatedAt: string;
  } | null;
}

interface LookupResult {
  assignment: {
    id: number;
    title: string;
    deadline: string | null;
    sourceType: string;
    maxGroupSize: number;
    classSection: { subjectCode: string; subjectName: string };
  };
  groups: {
    id: number;
    groupName: string;
    memberCount: number;
    leaderName: string | null;
    isFull: boolean;
  }[];
}

// ── Join a Class modal ────────────────────────────────────────────────────────
type ModalStep = "code" | "found" | "done";

function JoinClassModal({
  token,
  onClose,
  onJoined,
}: {
  token: string | null;
  onClose: () => void;
  onJoined: () => void;
}) {
  const { user }     = useAuth();
  const { navigate } = useRouter();

  const [step, setStep]                   = useState<ModalStep>("code");
  const [joinCode, setJoinCode]           = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError]     = useState("");
  const [found, setFound]                 = useState<LookupResult | null>(null);

  const [groupName, setGroupName]       = useState("");
  const [repoUrl, setRepoUrl]           = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError]   = useState("");

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [joinLoading, setJoinLoading]         = useState(false);
  const [joinError, setJoinError]             = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleLookup() {
    if (!joinCode.trim()) { setLookupError("Please enter a join code."); return; }
    setLookupLoading(true);
    setLookupError("");
    try {
      const res  = await fetch("/api/join/lookup", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await res.json() as { error?: string } & Partial<LookupResult>;
      if (!res.ok) { setLookupError(data.error ?? "Could not find that code."); return; }
      setFound(data as LookupResult);
      setStep("found");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) { setCreateError("Enter a group name."); return; }
    if (githubRequired && !repoUrl.trim()) { setCreateError("Enter the GitHub repository URL."); return; }
    setCreateLoading(true);
    setCreateError("");
    try {
      const res  = await fetch("/api/join/create-group", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ joinCode: joinCode.trim(), groupName: groupName.trim(), repoUrl: repoUrl.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setCreateError(data.error ?? "Could not create group."); return; }
      onJoined();
      setStep("done");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroupId) { setJoinError("Select a group to join."); return; }
    setJoinLoading(true);
    setJoinError("");
    try {
      const res  = await fetch("/api/join/join-group", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ projectGroupId: selectedGroupId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setJoinError(data.error ?? "Could not join group."); return; }
      onJoined();
      setStep("done");
    } finally {
      setJoinLoading(false);
    }
  }

  const noGithub = !user?.githubUsername;
  // GitHub username is only required for GITHUB or COMBINED source types
  const githubRequired = found
    ? found.assignment.sourceType === "GITHUB" || found.assignment.sourceType === "COMBINED"
    : false;
  const showGithubWarning = githubRequired && noGithub;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Join a Class</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === "code" && "Enter the join code provided by your instructor."}
              {step === "found" && found &&
                `${found.assignment.classSection.subjectCode} — ${found.assignment.classSection.subjectName}`}
              {step === "done" && "You have joined successfully."}
            </p>
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
        <div className="px-6 py-5 space-y-5">

          {/* ── Step: Enter code ── */}
          {step === "code" && (
            <>
              <div className="flex gap-2.5 flex-wrap">
                <input
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value); setLookupError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleLookup(); }}
                  disabled={lookupLoading}
                  placeholder="Enter join code — e.g. FT-AB12-CD34"
                  className="flex-1 min-w-40 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:text-slate-400"
                />
                <button
                  onClick={() => void handleLookup()}
                  disabled={lookupLoading || !joinCode.trim()}
                  className="shrink-0 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {lookupLoading ? "Looking up…" : "Look up →"}
                </button>
              </div>
              {lookupError && <p className="text-xs text-red-600">{lookupError}</p>}
            </>
          )}

          {/* ── Step: Code found — choose path ── */}
          {step === "found" && found && (
            <>
              {/* Project summary */}
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 text-xs space-y-1">
                <p className="font-semibold text-slate-700">{found.assignment.title}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-slate-500">
                  <span>{SOURCE_LABEL[found.assignment.sourceType] ?? found.assignment.sourceType}</span>
                  {found.assignment.deadline && (
                    <span>Deadline: {new Date(found.assignment.deadline).toLocaleDateString()}</span>
                  )}
                  <span>Max {found.assignment.maxGroupSize} per group</span>
                </div>
              </div>

              <div className="relative flex items-center gap-3">
                <div className="flex-1 border-t border-slate-100" />
                <span className="text-[11px] text-slate-400 shrink-0">Choose your path</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                {/* Create a Group */}
                <div className="border border-indigo-200 bg-indigo-50/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Create a Group</p>
                      <span className="text-[10px] font-bold text-indigo-600 bg-white border border-indigo-200 rounded px-1.5 py-0.5">
                        Group Leader
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    {githubRequired
                      ? "Create the first group and connect the GitHub repository. You become the group leader."
                      : "Create the first group. You become the group leader."}
                  </p>

                  {showGithubWarning && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                      <strong>GitHub username required for this project.</strong>{" "}
                      <button
                        onClick={() => { onClose(); navigate("/settings"); }}
                        className="underline font-semibold hover:text-amber-900"
                      >
                        Add it in Settings
                      </button>{" "}
                      before creating a group.
                    </div>
                  )}

                  <div className="space-y-2">
                    <input
                      value={groupName}
                      onChange={(e) => { setGroupName(e.target.value); setCreateError(""); }}
                      placeholder="Group name — e.g. Group 1"
                      disabled={createLoading || showGithubWarning}
                      className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                    {githubRequired && (
                      <input
                        value={repoUrl}
                        onChange={(e) => { setRepoUrl(e.target.value); setCreateError(""); }}
                        placeholder="GitHub repo URL — e.g. github.com/org/repo"
                        disabled={createLoading}
                        className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:text-slate-400"
                      />
                    )}
                  </div>

                  {createError && <p className="text-xs text-red-600">{createError}</p>}

                  <button
                    onClick={() => void handleCreateGroup()}
                    disabled={createLoading || showGithubWarning}
                    className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-200 disabled:cursor-not-allowed"
                  >
                    {createLoading ? "Creating…" : "Create Group"}
                  </button>

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Leadership is administrative only — it grants no contribution credit. You are scored on your actual work, the same as every other member.
                  </p>
                </div>

                {/* Join an Existing Group */}
                <div className="border border-slate-200 bg-white rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Join an Existing Group</p>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                        Member
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Select the group your leader has already created and register as a member.
                  </p>

                  {showGithubWarning && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                      <strong>GitHub username required for this project.</strong>{" "}
                      <button
                        onClick={() => { onClose(); navigate("/settings"); }}
                        className="underline font-semibold hover:text-amber-900"
                      >
                        Add it in Settings
                      </button>{" "}
                      before joining a group.
                    </div>
                  )}

                  {found.groups.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No groups yet — create the first one.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {found.groups.map((g) => (
                        <label
                          key={g.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                            g.isFull
                              ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200"
                              : selectedGroupId === g.id
                              ? "bg-indigo-50 border-indigo-300 cursor-pointer"
                              : "bg-slate-50 border-slate-200 hover:border-slate-300 cursor-pointer"
                          }`}
                        >
                          <input
                            type="radio"
                            name="group"
                            value={g.id}
                            disabled={g.isFull}
                            checked={selectedGroupId === g.id}
                            onChange={() => { setSelectedGroupId(g.id); setJoinError(""); }}
                            className="shrink-0"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-slate-700">{g.groupName}</span>
                            <span className="text-[11px] text-slate-400 ml-2">
                              {g.memberCount} / {found.assignment.maxGroupSize} members
                            </span>
                          </span>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {g.isFull ? "Full" : g.leaderName ? `Leader: ${g.leaderName}` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {joinError && <p className="text-xs text-red-600">{joinError}</p>}

                  <button
                    onClick={() => void handleJoinGroup()}
                    disabled={joinLoading || !selectedGroupId || found.groups.length === 0 || showGithubWarning}
                    className="w-full py-2 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {joinLoading ? "Joining…" : "Join Group"}
                  </button>

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {githubRequired
                      ? "Your GitHub username from your profile will be linked automatically."
                      : "Your account identity will be linked automatically."}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── Step: Done ── */}
          {step === "done" && (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">You've joined successfully!</p>
                <p className="text-xs text-slate-400 mt-1">
                  {githubRequired
                    ? "Your group and GitHub username have been linked."
                    : "You have been added to the group."}
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Enrollment card ───────────────────────────────────────────────────────────
function EnrollmentCard({
  enrollment,
  onNavigate,
  onManage,
}: {
  enrollment: Enrollment;
  onNavigate: () => void;
  onManage: () => void;
}) {
  const gradient = pickGradient(enrollment.classSection.subjectCode);
  const bandLabel = enrollment.classSection.edpCode || enrollment.classSection.subjectCode;
  const isLeader  = enrollment.membership.role === "LEADER";

  return (
    <div
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onNavigate()}
      className="w-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-indigo-300 hover:ring-1 hover:ring-indigo-100 transition-all cursor-pointer group"
    >
      {/* Colored band */}
      <div className="relative px-5 pt-5 pb-4 flex flex-col gap-3" style={{ background: gradient }}>
        <div className="flex items-start justify-between gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">
            {enrollment.membership.role === "LEADER" ? "Group Leader" : "Member"}
          </span>
        </div>
        <p className="text-white font-mono font-bold text-lg leading-tight tracking-tight">{bandLabel}</p>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors leading-snug">
            {enrollment.classSection.subjectName}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {enrollment.project.groupName} · {enrollment.assignment.title}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">
            {SOURCE_LABEL[enrollment.assignment.sourceType] ?? enrollment.assignment.sourceType}
          </span>
          {enrollment.assignment.deadline && (
            <span className="text-[11px] text-slate-500 bg-slate-50 rounded-full px-2.5 py-1 border border-slate-200">
              Due {new Date(enrollment.assignment.deadline).toLocaleDateString()}
            </span>
          )}
        </div>

        {enrollment.report ? (
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[enrollment.report.teamHealth ?? ""] ?? "text-slate-500 bg-slate-50 border-slate-200"}`}>
              {enrollment.report.teamHealth ?? "Unknown"}
            </span>
            <p className="text-[11px] text-slate-400">
              Analyzed {new Date(enrollment.report.generatedAt).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic">Awaiting first analysis by instructor</p>
        )}

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-indigo-500 group-hover:text-indigo-700 font-medium transition-colors">
            View my project →
          </span>
          {isLeader && (
            <button
              onClick={(e) => { e.stopPropagation(); onManage(); }}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
            >
              Manage group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Student dashboard ─────────────────────────────────────────────────────────
export function StudentPage() {
  const { user, token } = useAuth();
  const { navigate }    = useRouter();

  const [enrollments, setEnrollments]         = useState<Enrollment[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState("");
  const [showJoinModal, setShowJoinModal]     = useState(false);
  const [refreshKey, setRefreshKey]           = useState(0);
  const [managingProjectId, setManagingProjectId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/student/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load your enrollments.");
        const data = (await res.json()) as { enrollments: Enrollment[] };
        setEnrollments(data.enrollments);
        setError("");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load data."))
      .finally(() => setLoading(false));
  }, [token, refreshKey]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {showJoinModal && (
        <JoinClassModal
          token={token}
          onClose={() => setShowJoinModal(false)}
          onJoined={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {managingProjectId !== null && (
        <GroupManageModal
          projectId={managingProjectId}
          isInstructor={false}
          onClose={() => setManagingProjectId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-slate-800">
              Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {loading
                ? "Loading…"
                : `${enrollments.length} class${enrollments.length !== 1 ? "es" : ""} enrolled`}
            </p>
          </div>
          <button
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Join a Class
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-8 py-8 space-y-8">

        {loading && (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            Loading your classes…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && enrollments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No classes yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Join a class using the join code your instructor provided.
              </p>
            </div>
            <button
              onClick={() => setShowJoinModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Join a Class
            </button>
          </div>
        )}

        {!loading && !error && enrollments.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              My Classes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {enrollments.map((e) => (
                <EnrollmentCard
                  key={`${e.assignment.id}-${e.project.id}`}
                  enrollment={e}
                  onNavigate={() => navigate(`/student/group/${e.project.id}`)}
                  onManage={() => setManagingProjectId(e.project.id)}
                />
              ))}
            </div>
          </section>
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
