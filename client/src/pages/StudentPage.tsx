import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

// ── Gradient palette ──────────────────────────────────────────────────────────
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

// ── Types ─────────────────────────────────────────────────────────────────────
interface MyGroup {
  id: number;
  groupName: string;
  name: string;
  repoUrl: string;
  role: "LEADER" | "MEMBER";
  report: { gini: number | null; teamHealth: string | null; generatedAt: string } | null;
}

interface AssignmentSummary {
  id: number;
  title: string;
  deadline: string | null;
  sourceType: string;
  maxGroupSize: number;
  myGroup: MyGroup | null;
}

interface EnrolledClass {
  id: number;
  subjectCode: string;
  subjectName: string;
  course: string;
  edpCode: string;
  joinCode: string | null;
  joinedAt: string;
  assignments: AssignmentSummary[];
}

// ── Join a Class modal ────────────────────────────────────────────────────────
function JoinClassModal({
  token,
  onClose,
  onJoined,
}: {
  token: string | null;
  onClose: () => void;
  onJoined: () => void;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);
  const [enrolled, setEnrolled] = useState<{ subjectCode: string; subjectName: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleEnroll() {
    if (!joinCode.trim()) { setError("Please enter a join code."); return; }
    setLoading(true);
    setError("");
    try {
      const res  = await fetch("/api/join/class", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ joinCode: joinCode.trim() }),
      });
      const data = await res.json() as { error?: string; subjectCode?: string; subjectName?: string };
      if (!res.ok) { setError(data.error ?? "Could not enroll."); return; }
      setEnrolled({ subjectCode: data.subjectCode!, subjectName: data.subjectName! });
      onJoined();
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Join a Class</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {done ? "Enrollment successful" : "Enter the class join code from your instructor"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {done ? (
            <div className="space-y-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">You're enrolled!</p>
                {enrolled && (
                  <p className="text-xs text-slate-500 mt-1">
                    {enrolled.subjectCode} — {enrolled.subjectName}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">
                  Open the class to create or join a group.
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2.5">
                <input
                  value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value); setError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleEnroll(); }}
                  disabled={loading}
                  placeholder="e.g. FT-APPS-2026"
                  className="flex-1 min-w-0 rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:text-slate-400"
                />
                <button
                  onClick={() => void handleEnroll()}
                  disabled={loading || !joinCode.trim()}
                  className="shrink-0 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {loading ? "Enrolling…" : "Enroll →"}
                </button>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Class card — navigates to /student/class/:id ───────────────────────────────
function ClassCard({
  cls,
  onNavigate,
}: {
  cls: EnrolledClass;
  onNavigate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const gradient       = pickGradient(cls.subjectCode);
  const joinedCount    = cls.assignments.filter((a) => a.myGroup !== null).length;
  const totalAssignments = cls.assignments.length;
  const bandLabel      = cls.edpCode || cls.subjectCode;

  const latestReport = cls.assignments
    .flatMap((a) => (a.myGroup?.report ? [a.myGroup.report] : []))
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0] ?? null;

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!cls.joinCode) return;
    await navigator.clipboard.writeText(cls.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate(); }}
      className="group cursor-pointer w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      {/* Colored band */}
      <div
        className="relative px-5 pt-5 pb-4 flex flex-col gap-3"
        style={{ background: gradient }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">
            {joinedCount}/{totalAssignments} joined
          </span>
        </div>
        <p className="text-white font-mono font-bold text-lg leading-tight tracking-tight">{bandLabel}</p>
      </div>

      {/* Card body */}
      <div className="px-5 py-4 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 group-hover:text-indigo-700 transition-colors leading-snug">
            {cls.subjectName}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{cls.course}</p>
        </div>

        {/* Class join code — always visible with copy button */}
        {cls.joinCode ? (
          <div
            className="flex items-center gap-1.5 self-start bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-[10px] text-slate-400 shrink-0">Class code:</span>
            <span className="font-mono font-bold text-[11px] text-indigo-700 tracking-wider select-all">{cls.joinCode}</span>
            <button
              onClick={(e) => void handleCopy(e)}
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
        ) : (
          <span className="text-[11px] text-slate-300 italic">No join code</span>
        )}

        {/* Health — shown in addition to (not instead of) join code */}
        {latestReport?.teamHealth ? (
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[latestReport.teamHealth] ?? "text-slate-500 bg-slate-50 border-slate-200"}`}>
              {latestReport.teamHealth}
            </span>
            <p className="text-[11px] text-slate-400">
              Analyzed {new Date(latestReport.generatedAt).toLocaleDateString()}
            </p>
          </div>
        ) : (
          joinedCount > 0 && (
            <p className="text-[11px] text-slate-400 italic">Awaiting first analysis</p>
          )
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
          <span className="text-[11px] text-slate-400">
            {totalAssignments} project{totalAssignments !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors">
            Open →
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Student dashboard ─────────────────────────────────────────────────────────
export function StudentPage() {
  const { user, token } = useAuth();
  const { navigate }    = useRouter();

  const [classes, setClasses]         = useState<EnrolledClass[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [refreshKey, setRefreshKey]   = useState(0);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch("/api/student/classes", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load your classes.");
        const data = (await res.json()) as { classes: EnrolledClass[] };
        setClasses(data.classes);
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
                : `${classes.length} class${classes.length !== 1 ? "es" : ""} enrolled`}
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

        {!loading && !error && classes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">No classes yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Join a class using the class join code your instructor provided.
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

        {!loading && !error && classes.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
              My Classes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {classes.map((cls) => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  onNavigate={() => navigate(`/student/class/${cls.id}`)}
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
