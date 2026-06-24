import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

// ── Types ─────────────────────────────────────────────────────────────────────
interface DisputeItem {
  id:                 number;
  memberName:         string;
  reason:             string;
  status:             "OPEN" | "RESOLVED" | "DISMISSED";
  instructorResponse: string | null;
  createdAt:          string;
  resolvedAt:         string | null;
  project: {
    id:         number;
    groupName:  string;
    name:       string;
    assignment: {
      id:    number;
      title: string;
      classSection: {
        id:          number;
        subjectCode: string;
        subjectName: string;
        edpCode:     string;
      };
    } | null;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  OPEN:      "text-amber-700 bg-amber-50 border-amber-200",
  RESOLVED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  DISMISSED: "text-slate-500 bg-slate-50 border-slate-200",
};

// Unique key for a class section — subjectCode + EDP uniquely identifies a section
function classKey(cs: { subjectCode: string; edpCode: string }): string {
  return `${cs.subjectCode}|${cs.edpCode}`;
}

function classLabel(cs: { subjectCode: string; edpCode: string; subjectName: string }): string {
  return cs.edpCode ? `${cs.subjectCode} (${cs.edpCode})` : cs.subjectCode;
}

// ── Resolve modal ─────────────────────────────────────────────────────────────
function ResolveModal({
  dispute,
  token,
  onClose,
  onResolved,
}: {
  dispute:    DisputeItem;
  token:      string;
  onClose:    () => void;
  onResolved: (updated: DisputeItem) => void;
}) {
  const [resolution, setResolution] = useState<"RESOLVED" | "DISMISSED">("RESOLVED");
  const [response,   setResponse]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim()) { setError("Please provide a response."); return; }
    setSaving(true);
    setError("");
    try {
      const res  = await fetch(`/api/disputes/${dispute.id}/resolve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: resolution, instructorResponse: response.trim() }),
      });
      const json = await res.json() as DisputeItem & { error?: string };
      if (!res.ok) { setError(json.error ?? "Could not resolve dispute."); return; }
      onResolved({ ...dispute, ...json });
    } catch {
      setError("Network error — could not resolve.");
    } finally {
      setSaving(false);
    }
  }

  const cs      = dispute.project.assignment?.classSection;
  const context = [
    dispute.project.groupName || `Group ${dispute.project.id}`,
    dispute.project.assignment?.title,
    cs ? classLabel(cs) : undefined,
  ].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Respond to dispute</h2>
            <p className="text-xs text-slate-400 mt-0.5">{dispute.memberName} · {context}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Student's reason */}
        <div className="px-6 pt-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Student's note</p>
          <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
            {dispute.reason}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Resolution radio */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Resolution</p>
            <div className="flex gap-3">
              {(["RESOLVED", "DISMISSED"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="resolution"
                    value={opt}
                    checked={resolution === opt}
                    onChange={() => setResolution(opt)}
                    className="accent-indigo-500"
                  />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLE[opt]}`}>
                    {opt === "RESOLVED" ? "Resolved" : "Dismissed"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Response textarea */}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Your response</p>
            <textarea
              ref={textareaRef}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Provide context or a decision for the student…"
              rows={4}
              maxLength={2000}
              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !response.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Submit response"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type StatusFilter = "open" | "all";

export function DisputesPage() {
  const { token }    = useAuth();
  const { navigate } = useRouter();

  const [disputes,    setDisputes]    = useState<DisputeItem[]>([]);
  const [openCount,   setOpenCount]   = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [filter,      setFilter]      = useState<StatusFilter>("open");
  const [classFilter, setClassFilter] = useState<string>("");
  const [resolving,   setResolving]   = useState<DisputeItem | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch("/api/disputes", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as { disputes: DisputeItem[]; openCount: number; error?: string };
        if (!r.ok) { setError(json.error ?? "Could not load disputes."); return; }
        setDisputes(json.disputes ?? []);
        setOpenCount(json.openCount ?? 0);
      })
      .catch(() => setError("Network error — could not load disputes."))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Derive unique classes from all disputes for the filter dropdown
  const classOptions = Array.from(
    new Map(
      disputes
        .filter((d) => d.project.assignment?.classSection)
        .map((d) => {
          const cs = d.project.assignment!.classSection;
          return [classKey(cs), cs] as const;
        })
    ).values()
  ).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));

  // Apply both filters
  const visible = disputes.filter((d) => {
    if (filter === "open" && d.status !== "OPEN") return false;
    if (classFilter) {
      const cs = d.project.assignment?.classSection;
      if (!cs || classKey(cs) !== classFilter) return false;
    }
    return true;
  });

  function handleResolved(updated: DisputeItem) {
    setDisputes((prev) => prev.map((d) => d.id === updated.id ? updated : d));
    setOpenCount((n) => Math.max(0, n - 1));
    setResolving(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <button
                onClick={() => navigate("/dashboard")}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
              >
                Dashboard
              </button>
              <span className="text-slate-300 text-xs shrink-0">›</span>
              <span className="shrink-0 text-xs font-semibold text-slate-800">Disputes</span>
              {openCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-semibold">
                  {openCount} open
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Student-raised score disputes awaiting your review
            </p>
          </div>
          <button
            onClick={load}
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 sm:px-8 py-8">

        {/* Filters row: status tabs + class dropdown */}
        <div className="flex items-end justify-between gap-4 mb-6 border-b border-slate-200 pb-0 flex-wrap">
          {/* Status tabs */}
          <div className="flex gap-1">
            {(["open", "all"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  filter === f
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {f === "open" ? `Open${openCount > 0 ? ` (${openCount})` : ""}` : "All"}
              </button>
            ))}
          </div>

          {/* Class filter — only shown when there are multiple classes */}
          {classOptions.length > 1 && (
            <div className="mb-px">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer"
              >
                <option value="">All classes</option>
                {classOptions.map((cs) => (
                  <option key={classKey(cs)} value={classKey(cs)}>
                    {classLabel(cs)} — {cs.subjectName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            Loading…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-20 space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="text-xs text-indigo-600 hover:underline">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">
              {filter === "open" ? "No open disputes" : "No disputes yet"}
            </p>
            <p className="text-sm text-slate-400">
              {filter === "open"
                ? "All disputes have been resolved."
                : "Students haven't raised any disputes."}
            </p>
          </div>
        )}

        {/* Dispute list */}
        {!loading && !error && visible.length > 0 && (
          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white shadow-sm">
            {visible.map((d) => {
              const cs   = d.project.assignment?.classSection;
              const asgn = d.project.assignment;
              return (
                <div key={d.id} className={`px-5 py-5 ${d.status !== "OPEN" ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    {/* Status dot */}
                    <span className={`mt-[7px] w-2 h-2 rounded-full shrink-0 ${
                      d.status === "OPEN" ? "bg-amber-400" : "bg-transparent border border-slate-300"
                    }`} />

                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Top row: name + status badge + time */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{d.memberName}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${STATUS_STYLE[d.status]}`}>
                          {d.status}
                        </span>
                        <span className="text-xs text-slate-400">{timeAgo(d.createdAt)}</span>
                      </div>

                      {/* Full location context */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500">
                        {cs && (
                          <span className="font-mono font-semibold text-slate-700">
                            {cs.subjectCode}
                            {cs.edpCode && (
                              <span className="text-slate-400 font-normal"> ({cs.edpCode})</span>
                            )}
                          </span>
                        )}
                        {cs && <span className="text-slate-300">·</span>}
                        {asgn && <span>{asgn.title}</span>}
                        {asgn && <span className="text-slate-300">·</span>}
                        <span>{d.project.groupName || `Group ${d.project.id}`}</span>
                        {cs && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">{cs.subjectName}</span>
                          </>
                        )}
                      </div>

                      {/* Student's reason */}
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {d.reason}
                      </p>

                      {/* Instructor response (if resolved) */}
                      {d.instructorResponse && (
                        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Your response</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{d.instructorResponse}</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-3 pt-1 flex-wrap">
                        {d.status === "OPEN" && (
                          <button
                            onClick={() => setResolving(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                          >
                            Respond &amp; resolve
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/project/${d.project.id}`)}
                          className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors font-medium"
                        >
                          View group report →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button onClick={() => navigate("/overview")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            System Overview →
          </button>
        </div>
      </footer>

      {resolving && token && (
        <ResolveModal
          dispute={resolving}
          token={token}
          onClose={() => setResolving(null)}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
