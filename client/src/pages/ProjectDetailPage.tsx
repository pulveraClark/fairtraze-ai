import { useEffect, useState, useCallback } from "react";
import type { StoredReportResponse, ProjectSummaryItem, ProjectScoringConfig, ReportHistoryPoint } from "@shared/types";
import { useAuth } from "../context/AuthContext";
import { AppTopBar } from "../components/AppTopBar";
import { TeamHealthBanner } from "../components/TeamHealthBanner";
import { computeAssignmentBenchmark } from "../lib/benchmark";
import { ContributionChart } from "../components/ContributionChart";
import { TrendChart } from "../components/TrendChart";
import { MemberTable } from "../components/MemberTable";
import { Narrative } from "../components/Narrative";
import { AnalysisStepper } from "../components/AnalysisStepper";
import { DocumentGate } from "../components/DocumentGate";
import { PrintableReport } from "../components/PrintableReport";
import { ScoringSettingsModal } from "../components/ScoringSettingsModal";
import { parseClassLabel } from "../components/ClassCard";
import { useRouter } from "../router";

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "GitHub + Docs",
};

type Tab = "report" | "document";

interface Props {
  projectId: number;
}

export function ProjectDetailPage({ projectId }: Props) {
  const { navigate }  = useRouter();
  const { token, user } = useAuth();

  const [stored, setStored]               = useState<StoredReportResponse | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [notFound, setNotFound]           = useState(false);
  const [reanalyzing, setReanalyzing]     = useState(false);
  const [stepperDone, setStepperDone]     = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [showScoringModal, setShowScoringModal] = useState(false);
  // Tracks whether scoring config or membership changed after the last analysis (stale report warning)
  const [reportStale, setReportStale]           = useState(false);
  // Names of members with OPEN disputes (instructor only — students see nothing extra)
  const [disputedMembers, setDisputedMembers]   = useState<Set<string>>(new Set());
  // Per-flag review outcomes from resolved/dismissed disputes — shown as badges next to flags
  const [resolvedFlagOutcomes, setResolvedFlagOutcomes] = useState<Map<string, Map<string, "RESOLVED" | "DISMISSED">>>(new Map());
  const [activeTab, setActiveTab]               = useState<Tab>("report");

  // Summary used for breadcrumb + group switcher
  const [projectMeta, setProjectMeta] = useState<ProjectSummaryItem | null>(null);
  const [siblings, setSiblings]       = useState<ProjectSummaryItem[]>([]);

  // Gini/team-health across all past analysis runs — rendered only when there are 2+ points
  const [reportHistory, setReportHistory] = useState<ReportHistoryPoint[]>([]);

  const fetchStored = useCallback(async () => {
    setFetchError(null);
    setNotFound(false);
    setStored(null);
    setNarrativeText(null);   // clear immediately so no previous group's text bleeds through
    setReportStale(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFetchError(data.error ?? `Server error ${res.status}`);
        return;
      }
      const data = (await res.json()) as StoredReportResponse;
      setStored(data);
      setNarrativeText(data.narrative ?? null);
      setReportStale(!!data.scoringConfigChangedAt || !!data.membershipChangedAt);
    } catch {
      setFetchError("Network error — could not reach the server.");
    }
  }, [projectId, token]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/report/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setReportHistory([]); return; }
      const data = (await res.json()) as { history: ReportHistoryPoint[] };
      setReportHistory(data.history);
    } catch {
      setReportHistory([]);
    }
  }, [projectId, token]);

  const fetchSummary = useCallback(async () => {
    try {
      const res  = await fetch("/api/projects/summary", { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { summary: ProjectSummaryItem[] };
      const current = data.summary.find((g) => g.projectId === projectId) ?? null;
      setProjectMeta(current);
      if (current) {
        // assignmentId, not assignmentLabel — assignmentLabel is a display string shared at the
        // subject/class level ("CODE — Subject Name"), not guaranteed unique per Assignment, so
        // matching on it could pull in siblings from a different assignment under the same
        // subject (or miss real siblings on a label mismatch). assignmentId is the actual FK.
        const list = data.summary
          .filter((g) => g.assignmentId === current.assignmentId)
          .sort((a, b) => a.groupName.localeCompare(b.groupName));
        setSiblings(list);
      }
    } catch {
      // non-critical — breadcrumb degrades to Dashboard only
    }
  }, [projectId, token]);

  // Fetch all disputes for this project (OPEN + resolved) for the instructor view.
  // OPEN → shows "Disputed" badge in MemberTable.
  // RESOLVED/DISMISSED → shows review-outcome badge next to the disputed flag.
  const fetchDisputes = useCallback(async () => {
    if (!token || user?.systemRole !== "INSTRUCTOR") return;
    try {
      const res  = await fetch(`/api/projects/${projectId}/disputes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      interface DisputeSummary {
        id: number;
        memberName: string;
        status: "OPEN" | "RESOLVED" | "DISMISSED";
        disputedFlags: string;
        instructorResponse: string | null;
      }

      const data = (await res.json()) as { disputes: DisputeSummary[] };
      const all  = data.disputes;

      // OPEN disputes → "Disputed" badge
      setDisputedMembers(new Set(all.filter((d) => d.status === "OPEN").map((d) => d.memberName)));

      // RESOLVED/DISMISSED disputes → outcome badges per flag
      // disputedFlags is a JSON string: "[]" = legacy (applies to all 4 known flags)
      const KNOWN_FLAGS = ["inactive", "free-rider", "overload", "deadline-driven"];
      const outcomes = new Map<string, Map<string, "RESOLVED" | "DISMISSED">>();
      // Endpoint returns newest-first; iterate in order so first entry for a flag wins (most recent)
      for (const d of all) {
        if (d.status === "OPEN") continue;
        const outcome = d.status as "RESOLVED" | "DISMISSED";
        const flagList: string[] = (() => {
          try { return d.disputedFlags ? (JSON.parse(d.disputedFlags) as string[]) : []; }
          catch { return []; }
        })();
        const applicable = flagList.length === 0 ? KNOWN_FLAGS : flagList;
        if (!outcomes.has(d.memberName)) outcomes.set(d.memberName, new Map());
        const mm = outcomes.get(d.memberName)!;
        for (const f of applicable) {
          if (!mm.has(f)) mm.set(f, outcome); // first (most recent) wins
        }
      }
      setResolvedFlagOutcomes(outcomes);
    } catch {
      // non-critical — indicators simply won't show if fetch fails
    }
  }, [projectId, token, user?.systemRole]);

  useEffect(() => {
    void fetchStored();
    void fetchSummary();
    void fetchDisputes();
    void fetchHistory();
  }, [fetchStored, fetchSummary, fetchDisputes, fetchHistory]);

  async function handleAnalyze() {
    setReanalyzing(true);
    setStepperDone(false);
    setReanalyzeError(null);
    try {
      const res  = await fetch(`/api/projects/${projectId}/analyze`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setReanalyzeError((data as { error?: string }).error ?? `Server error ${res.status}`);
        return;
      }
      setStepperDone(true);
      await new Promise((r) => setTimeout(r, 800));
      await fetchStored();
      await fetchSummary();   // refresh health labels in switcher
      await fetchHistory();   // refresh trend chart with the new run
      setNotFound(false);
    } catch {
      setReanalyzeError("Network error — could not reach the server.");
    } finally {
      setReanalyzing(false);
    }
  }

  const isAdmin = user?.systemRole === "ADMIN";
  const dashboardUrl = isAdmin ? "/admin" : "/dashboard";

  // ── Source visibility & tabs ──────────────────────────────────────────────
  // projectMeta comes from /api/projects/summary, available even before any report
  // exists; stored.sourceType (from the report) is kept as a fallback for safety.
  const sourceType = projectMeta?.sourceType ?? stored?.sourceType ?? null;
  const showGitHub = sourceType !== "EDITOR";   // GITHUB, COMBINED, or legacy (null) → show GitHub (scoring settings button)
  // The GitHub-only chart/table/narrative block below is for GITHUB/legacy projects only —
  // COMBINED gets its own blended report block (chart+table+narrative) further down.
  const showGithubOnly = sourceType === "GITHUB" || sourceType === null;
  const showCombined   = sourceType === "COMBINED";
  const visibleTabs: Tab[] =
    sourceType === "EDITOR" || sourceType === "COMBINED"
      ? ["document", "report"]
      : ["report"]; // GITHUB or legacy
  const effectiveTab: Tab = visibleTabs.includes(activeTab) ? activeTab : "report";

  // ── Breadcrumb derivation ──────────────────────────────────────────────────
  const assignmentLabel = projectMeta?.assignmentLabel ?? "";
  const { code, subjectName } = assignmentLabel ? parseClassLabel(assignmentLabel) : { code: "", subjectName: "" };

  const classId      = projectMeta?.classId ?? null;
  const assignmentId = projectMeta?.assignmentId ?? null;

  const classUrl      = classId      ? `/class/${classId}`                              : "/dashboard";
  const assignmentUrl = classId && assignmentId ? `/class/${classId}/assignment/${assignmentId}` : classUrl;

  // This group's Gini vs. the average across its other analyzed siblings under the same
  // assignment — omitted entirely (averageGini: null) when there are no such siblings.
  const benchmark = computeAssignmentBenchmark(siblings, assignmentId, { excludeProjectId: projectId });

  const groupName = projectMeta?.groupName ?? stored?.groupName ?? `Project ${projectId}`;

  // ── Group switcher ────────────────────────────────────────────────────────
  const currentIdx = siblings.findIndex((g) => g.projectId === projectId);
  const prevGroup  = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextGroup  = currentIdx >= 0 && currentIdx < siblings.length - 1
    ? siblings[currentIdx + 1] : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="print:hidden">
        <AppTopBar />
      </div>

      {/* Page header */}
      <div className="print:hidden bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">

          {/* Left: full breadcrumb + subtext */}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <button
                onClick={() => navigate(dashboardUrl)}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
              >
                {isAdmin ? "Admin" : "Dashboard"}
              </button>
              {code && (
                <>
                  <span className="text-slate-300 text-xs shrink-0">›</span>
                  <button
                    onClick={() => navigate(classUrl)}
                    className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-mono font-medium"
                  >
                    {code}
                  </button>
                </>
              )}
              {assignmentId && (
                <>
                  <span className="text-slate-300 text-xs shrink-0">›</span>
                  <button
                    onClick={() => navigate(assignmentUrl)}
                    className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
                  >
                    {subjectName || "Assignment"}
                  </button>
                </>
              )}
              <span className="text-slate-300 text-xs shrink-0">›</span>
              <span className="shrink-0 text-xs font-semibold text-slate-800">{groupName}</span>
              {sourceType && (
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                  {sourceType}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400">
              {stored ? (
                <>
                  <a
                    href={stored.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline text-slate-400"
                  >
                    {stored.repoUrl.replace("https://github.com/", "")}
                  </a>
                  {" · "}
                  {stored.report.memberCount} members
                </>
              ) : (
                "Contribution analysis"
              )}
            </p>
          </div>

          {/* Right: group switcher + re-analyze */}
          <div className="flex items-center gap-2 flex-wrap">

            {isAdmin && (
              <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                Admin view — read only
              </span>
            )}

            {/* Group switcher — shown once siblings load */}
            {siblings.length > 1 && (
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
                <button
                  onClick={() => prevGroup && navigate(`/project/${prevGroup.projectId}`)}
                  disabled={!prevGroup}
                  title={prevGroup ? `← ${prevGroup.groupName}` : undefined}
                  className={`w-7 h-8 flex items-center justify-center transition-colors ${
                    prevGroup
                      ? "text-slate-800 hover:bg-slate-100 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <select
                  value={projectId}
                  onChange={(e) => navigate(`/project/${e.target.value}`)}
                  className="text-xs font-medium text-slate-700 bg-transparent border-none outline-none cursor-pointer px-1.5 h-8 max-w-[160px]"
                >
                  {siblings.map((g) => (
                    <option key={g.projectId} value={g.projectId}>
                      {g.groupName}
                      {g.isAnalyzed && g.teamHealth ? ` · ${g.teamHealth}` : " · Not analyzed"}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => nextGroup && navigate(`/project/${nextGroup.projectId}`)}
                  disabled={!nextGroup}
                  title={nextGroup ? `${nextGroup.groupName} →` : undefined}
                  className={`w-7 h-8 flex items-center justify-center transition-colors ${
                    nextGroup
                      ? "text-slate-800 hover:bg-slate-100 cursor-pointer"
                      : "text-slate-300 cursor-not-allowed"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}

            {/* Scoring settings button — shown only when a report exists, not for admin.
                Disabled (not hidden) for EDITOR reports: weight override isn't wired for document scoring yet. */}
            {stored && !reanalyzing && !isAdmin && showGitHub && (
              <button
                onClick={() => setShowScoringModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
                title="Adjust scoring weights and flag thresholds for this group"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Scoring settings
              </button>
            )}
            {stored && !reanalyzing && !isAdmin && !showGitHub && (
              <button
                disabled
                title="Weight adjustment isn't available for Docs-only scoring yet"
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-400 text-xs font-semibold rounded-lg cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Scoring settings
              </button>
            )}

            {/* Export / Print button — shown only when a report exists */}
            {stored && !reanalyzing && (
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 text-xs font-semibold rounded-lg transition-colors"
                title="Export a clean PDF via the browser print dialog"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-4a1 1 0 00-1-1H9a1 1 0 00-1 1v4a1 1 0 001 1zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Export / Print
              </button>
            )}

            {/* Re-analyze / Analyze button — hidden for admin */}
            {!isAdmin && (
              <button
                onClick={handleAnalyze}
                disabled={reanalyzing}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors ${
                  reanalyzing
                    ? "bg-indigo-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {reanalyzing ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin shrink-0" />
                    Fetching GitHub data…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {notFound ? "Analyze" : "Re-analyze"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tab bar — only shown when Document tab is also available */}
        {visibleTabs.length > 1 && (
          <div className="max-w-6xl mx-auto px-6 sm:px-8 flex border-t border-slate-100">
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
                {tab === "report" ? "Report" : "FairTraze Docs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="print:hidden flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 space-y-6">

        {/* Loading stepper */}
        {reanalyzing && <AnalysisStepper done={stepperDone} />}

        {/* Re-analyze error */}
        {reanalyzeError && !reanalyzing && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
            <span className="text-red-400 mt-0.5 text-base leading-none">&#9888;</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Analysis failed</p>
              <p className="text-sm text-red-700 mt-0.5">{reanalyzeError}</p>
            </div>
            <button onClick={() => setReanalyzeError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
          </div>
        )}

        {/* Network / fetch error */}
        {fetchError && !reanalyzing && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
            {fetchError}
          </div>
        )}

        {/* ── Report tab ─────────────────────────────────────────────────────── */}
        {effectiveTab === "report" && (
          <>
        {/* Stale report — membership changed and/or scoring config changed after last analysis */}
        {reportStale && stored && !reanalyzing && (
          <div className="bg-amber-100 border-2 border-amber-300 rounded-xl px-5 py-4 flex items-center gap-4 flex-wrap shadow-sm">
            <svg className="w-6 h-6 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="flex-1 min-w-[220px] text-sm font-semibold text-amber-900">
              Report may be outdated — membership or settings have changed. Click Re-analyze to update.
            </p>
            <button
              onClick={handleAnalyze}
              disabled={reanalyzing}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-analyze
            </button>
          </div>
        )}

        {/* Not analyzed yet */}
        {notFound && !reanalyzing && !reanalyzeError && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 flex flex-col items-center gap-4 text-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xl">
              ?
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">No report yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click <span className="font-semibold">Analyze</span> in the header to fetch GitHub activity
                and generate a contribution report for this project.
              </p>
            </div>
          </div>
        )}

        {/* Stored report */}
        {stored && !reanalyzing && (
          <>
            {/* Team health — the visual focal point of the report, shown first (source-agnostic) */}
            <TeamHealthBanner
              teamHealth={stored.report.teamHealth}
              gini={stored.report.gini}
              projectName={stored.groupName}
              memberCount={stored.report.memberCount}
              benchmark={benchmark}
            />

            {/* Report details */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                Report Details
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-slate-400 text-xs block mb-0.5">Group</span>
                  <p className="font-medium text-slate-800">{stored.groupName}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block mb-0.5">Repository</span>
                  <a
                    href={stored.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-600 hover:underline break-all"
                  >
                    {stored.repoUrl.replace("https://github.com/", "")}
                  </a>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block mb-0.5">Source</span>
                  <p className="font-medium text-slate-800">
                    {SOURCE_LABEL[sourceType ?? ""] ?? "GitHub"}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block mb-0.5">Analyzed</span>
                  <p className="font-medium text-slate-800">
                    {new Date(stored.analyzedAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 text-xs block mb-0.5">Members</span>
                  <p className="font-medium text-slate-800">{stored.report.memberCount}</p>
                </div>
              </div>

              {/* Scoring settings used for this report */}
              {stored.scoringConfig && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 font-medium">Scored with:</span>
                  <ScoredWithPill label="commits" display={String(stored.scoringConfig.weights.commits)} />
                  <ScoredWithPill label="lines" display={String(stored.scoringConfig.weights.lines)} />
                  <ScoredWithPill label="days" display={String(stored.scoringConfig.weights.activeDays)} />
                  <span className="text-slate-200 text-xs mx-0.5">|</span>
                  <ScoredWithPill label="free-rider" display={`${stored.scoringConfig.thresholds.freeRider}×`} />
                  <ScoredWithPill label="overload" display={`${stored.scoringConfig.thresholds.overload}×`} />
                  <ScoredWithPill label="deadline" display={`${Math.round(stored.scoringConfig.thresholds.deadlineDriven * 100)}%`} />
                  {reportStale && (
                    <span className="text-[10px] text-amber-600 font-semibold ml-1">(settings changed — re-analyze to update)</span>
                  )}
                </div>
              )}
            </div>

            {/* Imbalance trend — Gini/team health across all past analysis runs.
                Omitted until there are at least 2 runs, since a single point isn't a trend. */}
            {reportHistory.length >= 2 && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Imbalance Trend</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Gini coefficient across all analysis runs for this group</p>
                </div>
                <div className="px-6 pt-4 pb-2">
                  <TrendChart history={reportHistory} />
                </div>
              </div>
            )}

            {/* GitHub-specific sections (GITHUB-only / legacy projects) */}
            {showGithubOnly && (
              <>
                {/* Contribution chart — the "quick picture" at a glance */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Contribution Profiling — GitHub</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Quick picture — each member's share at a glance</p>
                  </div>
                  <div className="px-6 pt-4 pb-2">
                    <ContributionChart members={stored.report.members} />
                  </div>
                </div>

                {/* Member table — the "detail view", clearly separated from the chart above */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Member Contributions</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Detail view — per-member stats, significance, and flags</p>
                  </div>
                  <MemberTable members={stored.report.members} disputedMembers={disputedMembers} resolvedFlagOutcomes={resolvedFlagOutcomes} memberRoles={stored.memberRoles} deadlineWindowBasis={stored.report.deadlineWindowBasis} />
                </div>

                {/* AI narrative — keyed to projectId so it always reflects the current group */}
                <Narrative
                  key={projectId}
                  narrative={narrativeText}
                  projectId={projectId}
                  onNarrativeGenerated={(text) => setNarrativeText(text)}
                />

                {/* Unmatched logins */}
                {stored.unmatchedGitHubLogins.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <span className="font-semibold">Unmatched GitHub contributors: </span>
                    {stored.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
                    repository but are not in the team member list.
                  </div>
                )}
              </>
            )}

            {/* Combined (GitHub + Docs) sections — one blended report, not two separate ones */}
            {showCombined && (
              <>
                {stored.scoringConfig?.blend && (
                  <div className="flex items-center gap-1.5 flex-wrap -mt-2">
                    <span className="text-[11px] text-slate-400 font-medium">Source blend:</span>
                    <ScoredWithPill label="GitHub" display={`${Math.round(stored.scoringConfig.blend.wGitHub * 100)}%`} />
                    <ScoredWithPill label="Docs" display={`${Math.round(stored.scoringConfig.blend.wDocs * 100)}%`} />
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Contribution Profiling — GitHub + Docs</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Quick picture — each member's blended share at a glance</p>
                  </div>
                  <div className="px-6 pt-4 pb-2">
                    <ContributionChart members={stored.report.members} />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Member Contributions</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Detail view — GitHub share, Docs share, blend weights, and flags</p>
                  </div>
                  <MemberTable
                    members={stored.report.members}
                    variant="combined"
                    disputedMembers={disputedMembers}
                    resolvedFlagOutcomes={resolvedFlagOutcomes}
                    memberRoles={stored.memberRoles}
                    deadlineWindowBasis={stored.report.deadlineWindowBasis}
                  />
                </div>

                <Narrative
                  key={projectId}
                  narrative={narrativeText}
                  projectId={projectId}
                  onNarrativeGenerated={(text) => setNarrativeText(text)}
                />

                {stored.unmatchedGitHubLogins.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <span className="font-semibold">Unmatched GitHub contributors: </span>
                    {stored.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
                    repository but are not in the team member list.
                  </div>
                )}
              </>
            )}

            {/* FairTraze Docs (EDITOR) sections */}
            {sourceType === "EDITOR" && (
              <>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Contribution Profiling — FairTraze Docs</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Quick picture — each member's share at a glance</p>
                  </div>
                  <div className="px-6 pt-4 pb-2">
                    <ContributionChart members={stored.report.members} />
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Member Contributions</h2>
                    <p className="text-[11px] text-slate-400 mt-0.5">Detail view — per-member stats and flags</p>
                  </div>
                  <MemberTable
                    members={stored.report.members}
                    variant="document"
                    disputedMembers={disputedMembers}
                    resolvedFlagOutcomes={resolvedFlagOutcomes}
                    deadlineWindowBasis={stored.report.deadlineWindowBasis}
                  />
                </div>
              </>
            )}

            {/* Timestamp */}
            <p className="text-xs text-slate-400 text-right">
              Report generated {new Date(stored.analyzedAt).toLocaleString()}
            </p>
          </>
        )}
          </>
        )}

        {/* ── Document tab ─────────────────────────────────────────────────────── */}
        {effectiveTab === "document" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">FairTraze Docs</h2>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Collaborative editor — shared document for this group. Highlighting shows who wrote
                each part of the current text — it does not show edit history or deleted content.
              </span>
              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase">
                Read-only — instructor view
              </span>
            </div>
            <DocumentGate groupId={projectId} editable={false} canChooseTemplate={false} />
          </div>
        )}
      </main>

      <footer className="print:hidden border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button
            onClick={() => navigate("/overview")}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            System Overview →
          </button>
        </div>
      </footer>

      {/* Print-only layout — hidden on screen, rendered when printing */}
      {stored && !reanalyzing && (
        <PrintableReport
          stored={stored}
          narrative={narrativeText}
          assignmentLabel={assignmentLabel}
        />
      )}

      {/* Scoring settings modal */}
      {showScoringModal && stored && (
        <ScoringSettingsModal
          projectId={projectId}
          currentConfig={stored.currentConfig}
          sourceType={sourceType}
          onClose={() => setShowScoringModal(false)}
          onSaved={(newConfig: ProjectScoringConfig) => {
            setShowScoringModal(false);
            // Optimistically mark config stale and update currentConfig in stored
            setReportStale(true);
            setStored((prev) => prev ? { ...prev, currentConfig: newConfig, scoringConfigChangedAt: new Date().toISOString() } : prev);
          }}
        />
      )}
    </div>
  );
}

// ── Small helper component ────────────────────────────────────────────────────

function ScoredWithPill({ label, display }: { label: string; display: string }) {
  return (
    <span className="text-[11px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
      {label} <strong className="text-slate-700">{display}</strong>
    </span>
  );
}
