import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { FairTrazeDocsPreview } from "../components/FairTrazeDocsPreview";
import { GroupManageModal } from "../components/GroupManageModal";
import type { Flag } from "@shared/types";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TeamShare { share: number; isMe: boolean; }

interface GroupDetail {
  classSection: { id: number; subjectCode: string; subjectName: string; course: string; edpCode: string; };
  assignment:   { id: number; title: string; deadline: string | null; sourceType: string; };
  project:      { id: number; groupName: string; name: string; repoUrl: string; };
  membership:   { role: "LEADER" | "MEMBER"; joinedAt: string; };
  hasReport:    boolean;
  report: {
    gini:        number;
    teamHealth:  string;
    analyzedAt:  string;
    memberCount: number;
    myContribution: {
      contributionShare: number;
      commits:           number;
      additions:         number;
      deletions:         number;
      activeDays:        number;
      flags:             Flag[];
    } | null;
    teamShares: TeamShare[];
  } | null;
}

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

const FLAG_DESCRIPTIONS: Record<string, string> = {
  "deadline-driven": "A high proportion of your commits were recorded in the final third of the project timeline. This pattern may indicate delayed contribution.",
  "free-rider":      "Your contribution share is below half the equal share for this team.",
  "inactive":        "No recorded activity was found in the analyzed period.",
  "overload":        "Your contribution share significantly exceeds the equal share, suggesting an uneven workload distribution.",
};

// ── Team distribution bar ─────────────────────────────────────────────────────
function TeamDistributionBar({ shares }: { shares: TeamShare[] }) {
  const total = shares.reduce((s, m) => s + m.share, 0) || 1;
  return (
    <div className="flex h-3 rounded-full overflow-hidden w-full gap-px">
      {shares.map((m, i) => {
        const pct = (m.share / total) * 100;
        return (
          <div
            key={i}
            title={m.isMe ? `You: ${(m.share * 100).toFixed(1)}%` : `Teammate: ${(m.share * 100).toFixed(1)}%`}
            style={{ width: `${pct}%`, backgroundColor: m.isMe ? "#6366f1" : "#cbd5e1" }}
            className={`shrink-0 transition-all ${m.isMe ? "ring-1 ring-indigo-400 ring-inset" : ""}`}
          />
        );
      })}
    </div>
  );
}

type Tab = "contribution" | "document";

// ── Dispute types ─────────────────────────────────────────────────────────────
interface DisputeRecord {
  id:                 number;
  projectId:          number;
  status:             "OPEN" | "RESOLVED" | "DISMISSED";
  reason:             string;
  instructorResponse: string | null;
  createdAt:          string;
  resolvedAt:         string | null;
}

const DISPUTE_STATUS_STYLE: Record<string, string> = {
  OPEN:      "text-amber-700 bg-amber-50 border-amber-200",
  RESOLVED:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  DISMISSED: "text-slate-600 bg-slate-100 border-slate-200",
};

// ── Dispute submission modal ───────────────────────────────────────────────────
function DisputeModal({
  projectId,
  token,
  onClose,
  onSubmitted,
}: {
  projectId: number;
  token:     string;
  onClose:   () => void;
  onSubmitted: (d: DisputeRecord) => void;
}) {
  const [reason,   setReason]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError("Please describe the context for your instructor."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res  = await fetch("/api/disputes", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ projectId, reason: reason.trim() }),
      });
      const json = await res.json() as DisputeRecord & { error?: string };
      if (!res.ok) { setError(json.error ?? "Could not submit dispute."); return; }
      onSubmitted(json);
    } catch {
      setError("Network error — could not submit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Flag for review</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Describe context for your instructor. They will review and respond.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="E.g. I was working offline and pushed everything at the end due to connectivity issues…"
            rows={5}
            maxLength={2000}
            className="w-full rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function StudentGroupPage({ projectId }: { projectId: number }) {
  const { token }     = useAuth();
  const { navigate }  = useRouter();

  const [data, setData]           = useState<GroupDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("contribution");
  const [showManageModal, setShowManageModal]   = useState(false);
  const [refreshKey, setRefreshKey]             = useState(0);
  const [dispute, setDispute]                   = useState<DisputeRecord | null | undefined>(undefined);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError("");
    fetch(`/api/student/group/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const json = await res.json() as GroupDetail & { error?: string };
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) { navigate("/student"); return; }
          setError(json.error ?? "Could not load group.");
          return;
        }
        setData(json);
      })
      .catch(() => setError("Network error — could not load group."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId, refreshKey]);

  // Fetch the student's disputes to find any existing one for this group
  useEffect(() => {
    if (!token) return;
    fetch("/api/disputes/mine", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) return;
        const json = await r.json() as { disputes: DisputeRecord[] };
        const found = json.disputes.find((d) => d.projectId === projectId) ?? null;
        setDispute(found);
      })
      .catch(() => setDispute(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, projectId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <AppTopBar />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            Loading…
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <AppTopBar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600">{error || "Group not found."}</p>
            <button onClick={() => navigate("/student")} className="text-xs text-indigo-600 hover:underline">
              ← Back to My Classes
            </button>
          </div>
        </main>
      </div>
    );
  }

  const { classSection, assignment, project, membership, hasReport, report } = data;
  const bandCode = classSection.edpCode || classSection.subjectCode;

  const sourceType = assignment.sourceType;
  const visibleTabs: Tab[] =
    sourceType === "EDITOR"   ? ["document"] :
    sourceType === "COMBINED" ? ["contribution", "document"] :
    ["contribution"]; // GITHUB (default)
  const effectiveTab: Tab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0]!;

  const equalShare   = report ? 1 / report.memberCount : 0;
  const myShare      = report?.myContribution?.contributionShare ?? null;
  const mySharePct   = myShare !== null ? (myShare * 100).toFixed(1) : null;
  const equalSharePct = (equalShare * 100).toFixed(1);
  const giniLabel    = report
    ? (report.gini < 0.2 ? "Healthy" : report.gini < 0.4 ? "Moderate Risk" : "High Risk")
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {showManageModal && (
        <GroupManageModal
          projectId={projectId}
          isInstructor={false}
          onClose={() => setShowManageModal(false)}
          onChanged={() => {
            setShowManageModal(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

      {showDisputeModal && token && (
        <DisputeModal
          projectId={projectId}
          token={token}
          onClose={() => setShowDisputeModal(false)}
          onSubmitted={(d) => {
            setDispute(d);
            setShowDisputeModal(false);
          }}
        />
      )}

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={() => navigate("/student")}
              className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
            >
              My Classes
            </button>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <span className="shrink-0 text-xs font-mono font-medium text-slate-500">{bandCode}</span>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold text-slate-800 truncate">My Project</h1>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                  {SOURCE_LABEL[assignment.sourceType] ?? assignment.sourceType}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                  membership.role === "LEADER"
                    ? "text-indigo-700 bg-indigo-50 border-indigo-200"
                    : "text-slate-500 bg-white border-slate-200"
                }`}>
                  {membership.role === "LEADER" ? "Leader" : "Member"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {classSection.subjectName} · {project.groupName}
                {assignment.deadline && (
                  <> · Due {new Date(assignment.deadline).toLocaleDateString()}</>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowManageModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:border-slate-300 text-xs font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
              Manage Group
            </button>
            {report?.teamHealth && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[report.teamHealth] ?? ""}`}>
                {report.teamHealth}
              </span>
            )}
          </div>
        </div>

        {/* Tab bar — only rendered when more than one source applies */}
        {visibleTabs.length > 1 && (
          <div className="max-w-5xl mx-auto px-6 sm:px-8 flex border-t border-slate-100">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                  effectiveTab === tab
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "contribution" ? "My Contribution" : (
                  <>
                    FairTraze Docs
                    <span className="ml-1.5 text-[9px] font-bold text-violet-500 bg-violet-50 border border-violet-200 rounded px-1 py-0.5 normal-case tracking-normal">
                      Preview
                    </span>
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-8 py-8">

        {/* ── My Contribution tab ──────────────────────────────────────────────── */}
        {effectiveTab === "contribution" && (
          <div className="space-y-6">

            {/* Not analyzed yet */}
            {!hasReport && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-slate-700">Not analyzed yet</p>
                <p className="text-xs text-slate-400">
                  Your instructor will run the analysis for this project. Check back after they've reviewed your group.
                </p>
              </div>
            )}

            {/* Report available */}
            {hasReport && report && (
              <>
                {/* No contribution data for this student in the current report */}
                {report.myContribution === null && sourceType !== "EDITOR" && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-500 leading-relaxed">
                    No contribution data was found for your account in this report. If you joined after the last analysis was run, your instructor may need to re-run it to include your contributions.
                  </div>
                )}

                {/* Share overview */}
                {report.myContribution && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-800">Your contribution share</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {project.groupName} · {project.name} · {report.memberCount} members
                        </p>
                      </div>
                      <span className="text-3xl font-bold text-indigo-600">{mySharePct}%</span>
                    </div>

                    {/* Your share bar */}
                    <div className="mb-5">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500">Your share</span>
                        <span className="font-semibold text-slate-700">{mySharePct}%</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                        <div
                          className="h-full rounded-full bg-indigo-400 transition-all"
                          style={{ width: `${(myShare ?? 0) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-slate-500/60"
                          style={{ left: `${equalShare * 100}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Equal share for {report.memberCount} members = {equalSharePct}%
                        {(myShare ?? 0) >= equalShare
                          ? " · Your share is at or above the equal share."
                          : " · Your share is below the equal share."}
                        {" "}The marker line shows the equal share.
                      </p>
                    </div>

                    {/* Team distribution */}
                    {report.teamShares.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-slate-500">Team distribution</span>
                          <span className="text-[11px] text-slate-400">
                            <span className="inline-block w-2 h-2 rounded-sm bg-indigo-400 mr-1" />
                            You
                            <span className="inline-block w-2 h-2 rounded-sm bg-slate-300 mx-1 ml-2" />
                            Teammates
                          </span>
                        </div>
                        <TeamDistributionBar shares={report.teamShares} />
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          Individual teammate scores are not shown — only the overall team distribution.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Stats grid */}
                {report.myContribution && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {([
                      { label: "Commits",       value: String(report.myContribution.commits) },
                      { label: "Active Days",   value: String(report.myContribution.activeDays) },
                      { label: "Lines Added",   value: report.myContribution.additions.toLocaleString() },
                      { label: "Lines Deleted", value: report.myContribution.deletions.toLocaleString() },
                    ] as const).map(({ label, value }) => (
                      <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-4 text-center">
                        <p className="text-xl font-bold text-slate-800">{value}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Team context */}
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Team Overview</h3>
                  <div className="flex items-start gap-6 flex-wrap">
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1.5">Team Health</p>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${HEALTH_BADGE[report.teamHealth] ?? ""}`}>
                        {report.teamHealth}
                      </span>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1.5">Contribution Gini</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-700">{report.gini.toFixed(2)}</span>
                        {giniLabel && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HEALTH_BADGE[giniLabel]}`}>
                            {giniLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400 mb-1.5">Last Analyzed</p>
                      <p className="text-sm font-medium text-slate-700">
                        {new Date(report.analyzedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                    The Gini coefficient measures contribution inequality across the team. Below 0.2 is Healthy; 0.2–0.4 is Moderate Risk; above 0.4 is High Risk. Only aggregate team data is shown here — individual teammates' scores are not exposed in this view.
                  </p>
                </div>

                {/* Your flags */}
                {report.myContribution && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Your Flags</h3>
                    {report.myContribution.flags.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-400 text-center">
                        No flags on your contributions.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {report.myContribution.flags.map((flag) => (
                          <div key={flag} className="bg-white border border-yellow-200 rounded-xl p-5">
                            <div className="flex items-start gap-3">
                              <div className="shrink-0 w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center mt-0.5">
                                <svg className="w-3.5 h-3.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[11px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-0.5">
                                    {flag}
                                  </span>
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                  {FLAG_DESCRIPTIONS[flag] ?? "A flag has been raised on your contribution pattern."}
                                </p>
                                <p className="text-xs text-slate-400 mt-1.5">
                                  This flag is visible to your instructor. You may submit a note to provide context.
                                </p>
                                <div className="mt-4">
                                  {/* Existing dispute status */}
                                  {dispute && (
                                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-wide">Dispute status:</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${DISPUTE_STATUS_STYLE[dispute.status]}`}>
                                          {dispute.status}
                                        </span>
                                      </div>
                                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{dispute.reason}</p>
                                      {dispute.instructorResponse && (
                                        <div className="pt-1.5 border-t border-slate-200">
                                          <p className="text-[10px] font-semibold text-slate-500 mb-0.5">Instructor response:</p>
                                          <p className="text-xs text-slate-700 leading-relaxed">{dispute.instructorResponse}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Submit button — only if no OPEN dispute exists */}
                                  {dispute?.status === "OPEN" ? (
                                    <p className="text-[11px] text-amber-600">
                                      Your dispute is open and awaiting instructor review.
                                    </p>
                                  ) : (
                                    <button
                                      onClick={() => setShowDisputeModal(true)}
                                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                      </svg>
                                      {dispute ? "Submit another note" : "Flag for review / Add a note"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── FairTraze Docs tab (preview) ─────────────────────────────────────── */}
        {effectiveTab === "document" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">FairTraze Docs</h2>
              <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                Preview
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Collaborative editor — document contributions recorded per author
              </span>
            </div>
            <FairTrazeDocsPreview />
          </div>
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
