import { useEffect, useState, useCallback } from "react";
import type { StoredReportResponse, ProjectSummaryItem, ProjectScoringConfig, ReportHistoryPoint, AnyScoredMember } from "@shared/types";
import { useAuth } from "../context/AuthContext";
import { computeAssignmentBenchmark } from "../lib/benchmark";
import { TrendChart } from "../components/TrendChart";
import { DocsDataApproximateNotice } from "../components/DocsDataApproximateNotice";
import { PageHeader, StatTile, InfoTip, StatusPill, EmptyState, Skeleton, BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT, CARD } from "../components/ui";
import { MemberContributionList } from "../components/report/MemberContributionList";
import { MemberDrawer } from "../components/report/MemberDrawer";
import { giniBandsText } from "../lib/giniBands";
import type { FlagSource } from "../lib/flagRules";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { Narrative } from "../components/Narrative";
import { AnalysisStepper } from "../components/AnalysisStepper";
import { DocumentGate } from "../components/DocumentGate";
import { DocumentHistoryPanel } from "../components/DocumentHistoryPanel";
import { PrintableReport } from "../components/PrintableReport";
import { ScoringSettingsModal } from "../components/ScoringSettingsModal";
import { parseClassLabel } from "../components/ClassCard";
import { useRouter } from "../router";
import { useProjectsSummaryQuery } from "../hooks/useSharedQueries";
import { streamAnalyze, applyStreamEvent, markDone, startProgress, stageDurations, formatSeconds, AnalyzeError, INITIAL_PROGRESS, type AnalyzeProgress } from "../lib/analyzeStream";

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "Combined",
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
  const [loading, setLoading]             = useState(true);
  const [reanalyzing, setReanalyzing]     = useState(false);
  const [stepperDone, setStepperDone]     = useState(false);
  // True between the analyze response and the follow-up report reads finishing
  const [loadingReport, setLoadingReport] = useState(false);
  // Real collection counts/stage streamed from the server while an analysis runs
  const [progress, setProgress]           = useState<AnalyzeProgress>(INITIAL_PROGRESS);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  const [showScoringModal, setShowScoringModal] = useState(false);
  // Tracks whether scoring config or membership changed after the last analysis (stale report warning)
  const [reportStale, setReportStale]           = useState(false);
  // Names of members with OPEN disputes (instructor only — students see nothing extra)
  const [disputedMembers, setDisputedMembers]   = useState<Set<string>>(new Set());
  // Per-flag review outcomes from resolved/dismissed disputes — shown as badges next to flags
  const [resolvedFlagOutcomes, setResolvedFlagOutcomes] = useState<Map<string, Map<string, "RESOLVED" | "DISMISSED">>>(new Map());
  // A "comment reply" notification links here with ?tab=document. effectiveTab falls back to
  // "report" when the Document tab isn't available for this project.
  const [activeTab, setActiveTab]               = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get("tab") === "document" ? "document" : "report"
  );
  const [viewingHistory, setViewingHistory]     = useState(false);

  // Summary used for breadcrumb + group switcher — shared with the dashboard/class pages
  // via useProjectsSummaryQuery so navigating between them reuses the cached fetch.
  const summaryQuery = useProjectsSummaryQuery(token);
  const projectMeta: ProjectSummaryItem | null =
    summaryQuery.data?.find((g) => g.projectId === projectId) ?? null;
  // assignmentId, not assignmentLabel — assignmentLabel is a display string shared at the
  // subject/class level ("CODE — Subject Name"), not guaranteed unique per Assignment, so
  // matching on it could pull in siblings from a different assignment under the same
  // subject (or miss real siblings on a label mismatch). assignmentId is the actual FK.
  const siblings: ProjectSummaryItem[] = projectMeta
    ? (summaryQuery.data ?? [])
        .filter((g) => g.assignmentId === projectMeta.assignmentId)
        .sort((a, b) => a.groupName.localeCompare(b.groupName))
    : [];

  // Gini/team-health across all past analysis runs — rendered only when there are 2+ points
  const [reportHistory, setReportHistory] = useState<ReportHistoryPoint[]>([]);
  // Expanded by default — the card itself is already gated on having 2+ runs; this only
  // controls whether its body (the chart) is shown within that card.
  const [trendExpanded, setTrendExpanded] = useState(true);

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
    } finally {
      setLoading(false);
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
    void fetchDisputes();
    void fetchHistory();
  }, [fetchStored, fetchDisputes, fetchHistory]);

  async function handleAnalyze() {
    setReanalyzing(true);
    setStepperDone(false);
    setProgress(startProgress());
    setReanalyzeError(null);
    try {
      await streamAnalyze(projectId, token, (ev) => setProgress((prev) => applyStreamEvent(prev, ev)));
      // The analyze call itself is finished: release the button right away. The panel shows its
      // completed state with a report skeleton beneath while the follow-up reads run in parallel.
      const doneAt = performance.now();
      setProgress((prev) => markDone(prev, doneAt));
      setStepperDone(true);
      setReanalyzing(false);
      setLoadingReport(true);
      await Promise.all([
        fetchStored(),
        summaryQuery.refetch(),   // refresh health labels in switcher
        fetchHistory(),           // refresh trend chart with the new run
      ]);
      setNotFound(false);
    } catch (err) {
      setReanalyzeError(
        err instanceof AnalyzeError ? err.message : "Network error — could not reach the server."
      );
    } finally {
      setReanalyzing(false);
      setLoadingReport(false);
    }
  }

  const reducedMotion = usePrefersReducedMotion();
  // Measured duration of this session's last analysis run; shown as a note once the report is up.
  const analysisSeconds = progress.stage === "done" ? stageDurations(progress.times).total : undefined;
  const [selectedMember, setSelectedMember]= useState<AnyScoredMember | null>(null);
  const [drawerOpener, setDrawerOpener]     = useState<HTMLElement | null>(null);

  const isAdmin = user?.systemRole === "ADMIN";
  const dashboardUrl = isAdmin ? "/admin" : "/dashboard";

  // ── Source visibility & tabs ──────────────────────────────────────────────
  // projectMeta comes from /api/projects/summary, available even before any report
  // exists; stored.sourceType (from the report) is kept as a fallback for safety.
  const sourceType = projectMeta?.sourceType ?? stored?.sourceType ?? null;
  const showGitHub = sourceType !== "EDITOR";   // GITHUB, COMBINED, or legacy (null) → show GitHub (scoring settings button)
  const showCombined = sourceType === "COMBINED";
  const flagSource: FlagSource = showCombined ? "combined" : sourceType === "EDITOR" ? "document" : "github";
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

  const classUrl      = classId      ? `/class/${classId}`                              : dashboardUrl;
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

  // ── Summary values (read straight from the stored report) ─────────────────
  const reportMembers = stored?.report.members ?? [];
  const memberCount   = stored?.report.memberCount ?? 0;
  const equalSharePct = memberCount > 0 ? 100 / memberCount : 0;
  const flagged       = reportMembers.filter((m) => m.flags.length > 0);
  const totalFlags    = reportMembers.reduce((s, m) => s + m.flags.length, 0);
  const healthTone    = stored
    ? ({ Healthy: "green", "Moderate Risk": "amber", "High Risk": "red" } as const)[stored.report.teamHealth]
    : "neutral";

  const switchBtn = `flex h-8 w-8 items-center justify-center text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 ${FOCUS_LIGHT} focus-visible:-outline-offset-2`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Page header */}
      <div className="print:hidden bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-2 pb-4">
          <PageHeader
            breadcrumbs={[
              { label: isAdmin ? "Admin" : "Dashboard", href: dashboardUrl },
              ...(classId ? [{ label: code || "Class", href: classUrl }] : []),
              ...(assignmentId ? [{ label: subjectName || "Assignment", href: assignmentUrl }] : []),
              { label: groupName },
            ]}
            title={groupName}
            badges={
              <>
                {sourceType && <StatusPill kind="status" label={SOURCE_LABEL[sourceType] ?? sourceType} />}
                {isAdmin && <StatusPill kind="status" tone="violet" label="Admin view — read only" />}
              </>
            }
            meta={
              stored ? (
                <>
                  {sourceType !== "EDITOR" && stored.repoUrl && (
                    <>
                      <a
                        href={stored.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex min-h-10 items-center font-medium text-indigo-800 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`}
                      >
                        {stored.repoUrl.replace("https://github.com/", "")}
                      </a>
                      {" · "}
                    </>
                  )}
                  {stored.report.memberCount} members
                </>
              ) : (
                "Contribution analysis"
              )
            }
            actions={
              <>
                {/* Group switcher — shown once siblings load */}
                {siblings.length > 1 && (
                  <div role="group" aria-label="Switch group" className="flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
                    <button
                      type="button"
                      onClick={() => prevGroup && navigate(`/project/${prevGroup.projectId}`)}
                      disabled={!prevGroup}
                      aria-label={prevGroup ? `Previous group: ${prevGroup.groupName}` : "Previous group (none)"}
                      className={switchBtn}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <select
                      value={projectId}
                      onChange={(e) => navigate(`/project/${e.target.value}`)}
                      aria-label="Group"
                      className={`h-8 max-w-[11rem] cursor-pointer bg-transparent px-2 text-sm font-medium text-slate-900 ${FOCUS_LIGHT} focus-visible:-outline-offset-2`}
                    >
                      {siblings.map((g) => (
                        <option key={g.projectId} value={g.projectId}>
                          {g.groupName}
                          {g.isAnalyzed && g.teamHealth ? ` · ${g.teamHealth}` : " · Not analyzed"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => nextGroup && navigate(`/project/${nextGroup.projectId}`)}
                      disabled={!nextGroup}
                      aria-label={nextGroup ? `Next group: ${nextGroup.groupName}` : "Next group (none)"}
                      className={switchBtn}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Scoring settings — shown only when a report exists, not for admin.
                    Disabled (not hidden) for EDITOR reports: weight override isn't wired for document scoring yet. */}
                {stored && !reanalyzing && !isAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowScoringModal(true)}
                    disabled={!showGitHub}
                    title={showGitHub ? "Adjust scoring weights and flag thresholds for this group" : "Weight adjustment isn't available for Docs-only scoring yet"}
                    className={BUTTON_SECONDARY_COMPACT}
                  >
                    Scoring settings
                  </button>
                )}

                {/* Export / Print — shown only when a report exists */}
                {stored && !reanalyzing && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="Export a clean PDF via the browser print dialog"
                    className={BUTTON_SECONDARY_COMPACT}
                  >
                    Export / Print
                  </button>
                )}

                {/* Re-analyze / Analyze — hidden for admin */}
                {!isAdmin && (
                  <button type="button" onClick={handleAnalyze} disabled={reanalyzing} className={BUTTON_PRIMARY_COMPACT}>
                    {reanalyzing ? (
                      <>
                        <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" />
                        {sourceType === "EDITOR"
                          ? "Fetching FairTraze Docs data…"
                          : sourceType === "COMBINED"
                          ? "Fetching GitHub + FairTraze Docs data…"
                          : "Fetching GitHub data…"}
                      </>
                    ) : (
                      notFound ? "Analyze" : "Re-analyze"
                    )}
                  </button>
                )}
              </>
            }
          />
        </div>

        {/* Tab bar — only shown when Document tab is also available */}
        {visibleTabs.length > 1 && (
          <div role="tablist" aria-label="Report sections" className="max-w-6xl mx-auto px-4 sm:px-8 flex border-t border-slate-200">
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`min-h-10 px-4 text-base font-semibold transition-colors border-b-2 -mb-px ${FOCUS_LIGHT} focus-visible:-outline-offset-2 ${
                  effectiveTab === tab
                    ? "border-indigo-700 text-indigo-800"
                    : "border-transparent text-slate-700 hover:text-slate-900"
                }`}
              >
                {tab === "report" ? "Report" : "FairTraze Docs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className="print:hidden flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-4 space-y-4">

        {/* Analysis panel: live while running, completed state while the report reloads */}
        {(reanalyzing || loadingReport) && (
          <AnalysisStepper progress={progress} done={stepperDone} sourceType={sourceType} />
        )}

        {/* Re-analyze error */}
        {reanalyzeError && !reanalyzing && (
          <div role="alert" className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-red-900">Analysis failed</p>
              <p className="text-base leading-normal text-red-900 break-words">{reanalyzeError}</p>
            </div>
            <button
              type="button"
              onClick={() => setReanalyzeError(null)}
              aria-label="Dismiss error"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl leading-none text-red-900 hover:bg-red-100 ${FOCUS_LIGHT}`}
            >
              &times;
            </button>
          </div>
        )}

        {/* Network / fetch error */}
        {fetchError && !reanalyzing && (
          <div role="alert" className="bg-red-50 border border-red-300 rounded-xl p-4 text-base leading-normal text-red-900">
            {fetchError}
          </div>
        )}

        {/* ── Report tab ─────────────────────────────────────────────────────── */}
        {effectiveTab === "report" && (
          <>
        {(loading || loadingReport) && (
          <div aria-busy="true" role="status" className="space-y-4">
            <span className="sr-only">Loading report…</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-64" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        )}

        {/* Stale report — membership changed and/or scoring config changed after last analysis */}
        {reportStale && stored && !reanalyzing && (
          <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap">
            <p className="flex-1 min-w-[14rem] text-base font-semibold leading-normal text-amber-950">
              Report may be outdated — membership or settings have changed. Re-analyze to update.
            </p>
            <button type="button" onClick={handleAnalyze} disabled={reanalyzing} className={BUTTON_PRIMARY_COMPACT}>
              Re-analyze
            </button>
          </div>
        )}

        {/* Not analyzed yet */}
        {notFound && !reanalyzing && !reanalyzeError && (
          <EmptyState
            title="No report yet"
            description={
              <>
                Select <span className="font-semibold">Analyze</span> in the header to collect activity
                and generate a contribution report for this group.
              </>
            }
          />
        )}

        {/* Stored report */}
        {stored && !reanalyzing && (
          <>
            {analysisSeconds !== undefined && (
              <p className="flex items-center gap-2 text-xs text-slate-600">
                <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700">✓</span>
                Analysis complete in {formatSeconds(analysisSeconds)}
              </p>
            )}

            {/* Summary row */}
            <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                compact
                label="Team health"
                tone={healthTone}
                value={<StatusPill kind="health" value={stored.report.teamHealth} className="!text-base" />}
                detail={
                  <span className="flex items-center gap-1">
                    Gini {stored.report.gini.toFixed(3)}
                    <InfoTip label="About the Gini coefficient and team health">
                      <span className="block">0 = perfectly equal, 1 = one member holds everything.</span>
                      <span className="mt-1 block">{giniBandsText()}</span>
                      {benchmark.averageGini !== null && (
                        <span className="mt-1 block">
                          Average for other groups in this assignment: {benchmark.averageGini.toFixed(3)} —{" "}
                          {stored.report.gini > benchmark.averageGini
                            ? "this group is more uneven"
                            : stored.report.gini < benchmark.averageGini
                            ? "this group is more even"
                            : "equal"}.
                        </span>
                      )}
                    </InfoTip>
                  </span>
                }
              />
              <StatTile
                compact
                label="Flags"
                value={totalFlags}
                detail={
                  flagged.length === 0
                    ? "No members flagged."
                    : flagged.map((m) => m.studentName).join(", ")
                }
              />
              <StatTile
                compact
                label="Members"
                value={memberCount}
                detail={`equal share ${equalSharePct.toFixed(0)}%`}
              />
              <StatTile
                compact
                label="Analysis"
                value={<span className="text-base">{SOURCE_LABEL[sourceType ?? ""] ?? "GitHub"} · {new Date(stored.analyzedAt).toLocaleDateString()}</span>}
                detail={
                  sourceType !== "EDITOR" && stored.repoUrl ? (
                    <a
                      href={stored.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`break-all font-medium text-indigo-800 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`}
                    >
                      {stored.repoUrl.replace("https://github.com/", "")}
                    </a>
                  ) : (
                    "FairTraze Docs activity"
                  )
                }
              />
            </section>

            {stored.docsDataApproximate && (
              <DocsDataApproximateNotice fixedAt={stored.docsDataFixedAt} className="mb-4" />
            )}

            {/* Member contributions — replaces the old bar chart and table */}
            <MemberContributionList
              members={stored.report.members}
              memberRoles={stored.memberRoles}
              disputedMembers={disputedMembers}
              resolvedFlagOutcomes={resolvedFlagOutcomes}
              onOpen={(m, el) => { setDrawerOpener(el); setSelectedMember(m); }}
            />

            {/* Unmatched logins (GitHub-based sources only) */}
            {sourceType !== "EDITOR" && stored.unmatchedGitHubLogins.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-base leading-normal text-amber-950">
                <span className="font-semibold">Unmatched GitHub contributors: </span>
                {stored.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
                repository but are not in the team member list.
              </div>
            )}

            {/* AI report + Imbalance trend (equal height) */}
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
              {/* keyed to projectId so it always reflects the current group */}
              <div className={reportHistory.length >= 2 ? "h-full min-w-0" : "h-full min-w-0 lg:col-span-2"}>
                <Narrative
                  key={projectId}
                  narrative={narrativeText}
                  projectId={projectId}
                  onNarrativeGenerated={(text) => setNarrativeText(text)}
                />
              </div>
              {/* Imbalance trend — omitted until there are at least 2 runs, since a single point isn't a trend. */}
              {reportHistory.length >= 2 && (
                <section aria-labelledby="trend-title" className={`${CARD} h-full min-w-0 overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => setTrendExpanded((v) => !v)}
                    aria-expanded={trendExpanded}
                    className={`flex min-h-10 w-full items-start justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50 ${FOCUS_LIGHT} focus-visible:-outline-offset-2`}
                  >
                    <span>
                      <span id="trend-title" className="block text-lg font-semibold text-slate-900">Imbalance trend</span>
                      <span className="block text-sm leading-normal text-slate-700">Gini coefficient across all analysis runs for this group</span>
                    </span>
                    <svg
                      className={`mt-1.5 h-5 w-5 shrink-0 text-slate-700 ${reducedMotion ? "" : "transition-transform duration-200"} ${trendExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {trendExpanded && (
                    <div className="border-t border-slate-200 px-4 pt-4 pb-2">
                      <TrendChart history={reportHistory} />
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
          </>
        )}

        {/* ── Document tab ─────────────────────────────────────────────────────── */}
        {effectiveTab === "document" && (
          <div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-900">FairTraze Docs</h2>
              <p className="hidden text-sm leading-normal text-slate-700 sm:block">
                {viewingHistory
                  ? "Past versions of this group's document, captured at each analysis run"
                  : "Collaborative editor — shared document for this group. Highlighting shows who wrote each part of the current text — it does not show edit history or deleted content."}
              </p>
              <StatusPill kind="status" label="Read-only — instructor view" />
              <button type="button" onClick={() => setViewingHistory((v) => !v)} className={`${BUTTON_SECONDARY} ml-auto`}>
                {viewingHistory ? "Back to live document" : "History"}
              </button>
            </div>
            {viewingHistory ? (
              <DocumentHistoryPanel groupId={projectId} />
            ) : (
              <DocumentGate groupId={projectId} editable={false} canChooseTemplate={false} />
            )}
          </div>
        )}
      </main>

      <footer className="print:hidden border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2 flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm leading-normal text-slate-700">
            Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
          </p>
        </div>
      </footer>

      {/* Member details drawer */}
      {stored && (
        <MemberDrawer
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          restoreFocusTo={drawerOpener}
          source={flagSource}
          thresholds={stored.scoringConfig?.thresholds ?? null}
          deadlineBasis={stored.report.deadlineWindowBasis ?? null}
          memberCount={stored.report.memberCount}
          memberRoles={stored.memberRoles}
          disputed={selectedMember ? disputedMembers.has(selectedMember.studentName) : false}
          flagOutcomes={selectedMember ? resolvedFlagOutcomes.get(selectedMember.studentName) : undefined}
          onOpenDisputes={() => { setSelectedMember(null); navigate("/disputes"); }}
          onOpenScoringSettings={() => { setSelectedMember(null); setShowScoringModal(true); }}
        />
      )}

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
