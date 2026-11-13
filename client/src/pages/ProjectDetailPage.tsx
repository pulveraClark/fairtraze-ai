import { HISTORY_HINT } from "../lib/docActionHints";
import { AppFooter } from "../components/AppFooter";
import { useEffect, useState, useCallback, useRef } from "react";
import type { StoredReportResponse, ProjectSummaryItem, ProjectScoringConfig, AnyScoredMember } from "@shared/types";
import { useAuth } from "../context/AuthContext";
import { computeAssignmentBenchmark } from "../lib/benchmark";
import { DocsDataApproximateNotice } from "../components/DocsDataApproximateNotice";
import { ReportNotices } from "../components/report/ReportNotices";
import { NOTICE_PRIORITY, type ReportNotice } from "../lib/reportNotices";
import { PageHeader, StatusPill, EmptyState, Skeleton, BUTTON_PRIMARY_COMPACT, BUTTON_SECONDARY, BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../components/ui";
import { MemberContributionList } from "../components/report/MemberContributionList";
import { MemberDrawer } from "../components/report/MemberDrawer";
import type { FlagSource } from "../lib/flagRules";
import { Narrative } from "../components/Narrative";
import { MemberWorkSummary } from "../components/report/AiWorkSummary";
import { useAiReview } from "../hooks/useAiReview";
import { useGenerateAiReport } from "../hooks/useGenerateAiReport";
import { reviewStatusLine, workSummaryState } from "../lib/aiReview";
import { AnalysisStepper } from "../components/AnalysisStepper";
import { DocumentGate } from "../components/DocumentGate";
import { DocumentHistoryPanel } from "../components/DocumentHistoryPanel";
import { groupTabs, resolveTab, tabFromSearch, type GroupTab } from "../lib/groupTabs";
import { TasksTab } from "../components/tasks/TasksTab";
import { LinkedHeadingNotice } from "../components/tasks/details/LinkedHeadingNotice";
import { useDocHeadingFocus } from "../hooks/useDocHeadingFocus";
import { DocSectionProvider, useDocSectionNav } from "../hooks/useDocSectionLink";
import { PrintableReport } from "../components/PrintableReport";

import { ScoringSettingsModal } from "../components/ScoringSettingsModal";
import { groupCrumbLabels } from "../lib/groupCrumbs";
import { NO_ACTIVITY_LABEL, noActivityFromShares, presentedHealth, quietSource, quietSourceText } from "../lib/groupActivity";
import { TeamSummaryBar } from "../components/report/TeamSummaryBar";
import { useRouter } from "../router";
import { useProjectsSummaryQuery } from "../hooks/useSharedQueries";
import { LastAnalyzed } from "../components/LastAnalyzed";
import { AnalysisFailedCard } from "../components/AnalysisFailedCard";
import { analysisErrorText } from "../lib/failureText";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { requestReportRefresh } from "../lib/refreshReport";
import { streamAnalyze, applyStreamEvent, markDone, startProgress, stageDurations, formatSeconds, AnalyzeError, INITIAL_PROGRESS, type AnalyzeProgress } from "../lib/analyzeStream";
import { RULES_OUTDATED_INSTRUCTOR_NOTICE } from "@shared/scoringRules";
import { REPO_CHANGED_NOTICE, REPO_NOT_LINKED_HINT, REPO_NOT_LINKED_MESSAGE, REPO_NOT_LINKED_PILL, repoNotLinked } from "../lib/repoNotice";

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "Combined",
};

type Tab = GroupTab;

interface Props {
  projectId: number;
}

export function ProjectDetailPage({ projectId }: Props) {
  const { navigate }  = useRouter();
  const { token, user } = useAuth();
  const aiReview = useAiReview(projectId, token);

  const [stored, setStored]               = useState<StoredReportResponse | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [narrativeOutdated, setNarrativeOutdated] = useState(false);
  const onNarrativeGenerated = useCallback((text: string) => { setNarrativeText(text); setNarrativeOutdated(false); }, []);
  // One generate action shared by the AI report card and the member details window.
  const aiGenerator = useGenerateAiReport(projectId, aiReview, onNarrativeGenerated);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [notFound, setNotFound]           = useState(false);
  const [loading, setLoading]             = useState(true);
  const [reanalyzing, setReanalyzing]     = useState(false);
  const analyzeLock = useRef(false); // set synchronously, so a second click before the re-render is ignored
  const [stepperDone, setStepperDone]     = useState(false);
  // True between the analyze response and the follow-up report reads finishing
  const [loadingReport, setLoadingReport] = useState(false);
  // Real collection counts/stage streamed from the server while an analysis runs
  const [progress, setProgress]           = useState<AnalyzeProgress>(INITIAL_PROGRESS);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);
  // "Link a GitHub repository first" is guidance, not a failure: shown as a notice, not "Analysis failed".
  const [repoMissingFromServer, setRepoMissingFromServer] = useState(false);
  const [showScoringModal, setShowScoringModal] = useState(false);
  // Tracks whether scoring config or membership changed after the last analysis (stale report warning)
  const [reportStale, setReportStale]           = useState(false);
  // Names of members with OPEN disputes (instructor only — students see nothing extra)
  const [disputedMembers, setDisputedMembers]   = useState<Set<string>>(new Set());
  // Per-flag review outcomes from resolved/dismissed disputes — shown as badges next to flags
  const [resolvedFlagOutcomes, setResolvedFlagOutcomes] = useState<Map<string, Map<string, "RESOLVED" | "DISMISSED">>>(new Map());
  // A "comment reply" notification links here with ?tab=document. effectiveTab falls back to
  // "report" when the Document tab isn't available for this project.
  const [activeTab, setActiveTab]               = useState<Tab | null>(() => tabFromSearch(window.location.search));
  // ?tab=tasks&task=<id> opens a task's panel (read-only here: instructors and admins only view tasks).
  const initialTaskId = (() => {
    const n = Number(new URLSearchParams(window.location.search).get("task"));
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  function selectTab(tab: Tab, taskId: number | null = null) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    if (tab === "tasks" && taskId !== null) url.searchParams.set("task", String(taskId)); else url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", url);
  }
  const [viewingHistory, setViewingHistory]     = useState(false);
  // "Open in document" from a task: the editor scrolls to the task's linked heading (read-only here).
  const docFocus = useDocHeadingFocus(() => { setViewingHistory(false); selectTab("document"); });
  // Evidence in the AI review links to a Docs section: same tab, with a history entry so Back returns.
  const docSection = useDocSectionNav(
    useCallback(() => { setViewingHistory(false); setActiveTab("document"); }, []),
    useCallback(() => setActiveTab(tabFromSearch(window.location.search)), []),
  );

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

  // The analysis time of the report on screen, for the quiet re-read to compare against.
  const storedAnalyzedAt = useRef<string | undefined>(undefined);

  // quiet: a background re-read (automatic refresh). It keeps the page as it is, replaces the report
  // only when a new one has arrived, and ignores failures - the report already on screen stays.
  const fetchStored = useCallback(async (opts: { quiet?: boolean } = {}) => {
    const quiet = opts.quiet === true;
    if (!quiet) {
      setFetchError(null);
      setNotFound(false);
      setStored(null);
      setNarrativeText(null);   // clear immediately so no previous group's text bleeds through
      setNarrativeOutdated(false);
      setReportStale(false);
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (quiet && !res.ok) return;
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFetchError(data.error ?? `Server error ${res.status}`);
        return;
      }
      const data = (await res.json()) as StoredReportResponse;
      if (quiet && data.analyzedAt === storedAnalyzedAt.current) return;
      setStored(data);
      setNarrativeText(data.narrative ?? null);
      setNarrativeOutdated(data.narrativeOutdated === true);
      setReportStale(!!data.scoringConfigChangedAt || !!data.membershipChangedAt || !!data.rulesOutdated);
    } catch {
      if (!quiet) setFetchError("Network error — could not reach the server.");
    } finally {
      if (!quiet) setLoading(false);
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
  }, [fetchStored, fetchDisputes]);

  useEffect(() => { storedAnalyzedAt.current = stored?.analyzedAt; }, [stored?.analyzedAt]);

  // Open a report older than an hour in an active project: the server refreshes it in the background.
  const { updating } = useAutoRefresh({
    key: projectId,
    enabled: !!stored,
    analyzedAt: stored?.analyzedAt,
    request: () => requestReportRefresh(projectId, token),
    refetch: () => fetchStored({ quiet: true }),
  });
  // A new report may change the group's health label in the switcher.
  const seenAnalyzedAt = useRef<string | undefined>(undefined);
  useEffect(() => {
    const at = stored?.analyzedAt;
    if (seenAnalyzedAt.current && at && at !== seenAnalyzedAt.current) {
      void summaryQuery.refetch();
    }
    seenAnalyzedAt.current = at;
  }, [stored?.analyzedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze() {
    if (analyzeLock.current) return;
    analyzeLock.current = true;
    setReanalyzing(true);
    setStepperDone(false);
    setProgress(startProgress());
    setReanalyzeError(null);
    setRepoMissingFromServer(false);
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
      ]);
      setNotFound(false);
    } catch (err) {
      if (err instanceof AnalyzeError && err.code === "REPO_NOT_LINKED") {
        setRepoMissingFromServer(true);
      } else {
        setReanalyzeError(analysisErrorText(err));
      }
    } finally {
      analyzeLock.current = false;
      setReanalyzing(false);
      setLoadingReport(false);
    }
  }

  // Measured duration of this session's last analysis run; shown as a note once the report is up.
  const analysisSeconds = progress.stage === "done" ? stageDurations(progress.times).total : undefined;
  // Selected by name (the list's own key) so a refreshed report resolves to the current member object.
  const [selectedName, setSelectedName]     = useState<string | null>(null);
  const [drawerOpener, setDrawerOpener]     = useState<HTMLElement | null>(null);
  const [openedName, setOpenedName]         = useState<string | null>(null);

  const noRepo = repoMissingFromServer || (!!projectMeta && repoNotLinked(projectMeta));

  const isAdmin = user?.systemRole === "ADMIN";
  const dashboardUrl = isAdmin ? "/admin" : "/dashboard";

  // ── Source visibility & tabs ──────────────────────────────────────────────
  // projectMeta comes from /api/projects/summary, available even before any report
  // exists; stored.sourceType (from the report) is kept as a fallback for safety.
  const sourceType = projectMeta?.sourceType ?? stored?.sourceType ?? null;
  const showGitHub = sourceType !== "EDITOR";   // GITHUB, COMBINED, or legacy (null) → show GitHub (scoring settings button)
  const showCombined = sourceType === "COMBINED";
  const flagSource: FlagSource = showCombined ? "combined" : sourceType === "EDITOR" ? "document" : "github";
  const visibleTabs: Tab[] = groupTabs("instructor", sourceType);
  const effectiveTab: Tab = resolveTab(activeTab, visibleTabs);

  // ── Breadcrumb derivation ──────────────────────────────────────────────────
  const assignmentLabel = projectMeta?.assignmentLabel ?? "";
  const crumbs = groupCrumbLabels(projectMeta);

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

  // Focus goes back to the row that opened the dialog; if the user moved to another member, to that member's row.
  function closeMember() {
    const name = selectedName;
    setSelectedName(null);
    if (name !== null && name !== openedName) {
      requestAnimationFrame(() => {
        const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-member-row]"));
        rows.find((r) => r.dataset.memberRow === name)?.querySelector<HTMLElement>("button")?.focus();
      });
    }
  }

  // ── Summary values (read straight from the stored report) ─────────────────
  // While nobody has any recorded activity, "inactive" pills on every member and a health label say more than
  // the data does. Display only: the stored report (and Export / Print) keeps the computed flags.
  const storedMembers = stored?.report.members ?? [];
  const noActivity    = noActivityFromShares(storedMembers.map((m) => m.contributionShare));
  const reportMembers = noActivity ? storedMembers.map((m) => ({ ...m, flags: [] })) : storedMembers;
  const selectedIdx    = selectedName === null ? -1 : reportMembers.findIndex((m) => m.studentName === selectedName);
  const selectedMember: AnyScoredMember | null = selectedIdx >= 0 ? reportMembers[selectedIdx] : null;
  const flagged       = reportMembers.filter((m) => m.flags.length > 0);
  // "Early data" (read-time, display only): low = health and flags stay visible but grey; medium = a small note.
  const confidence    = noActivity ? null : (stored?.dataConfidence ?? null);
  const earlyMuted    = confidence === "low";

  const reportNotices: ReportNotice[] = [];
  if (stored && reportStale) {
    reportNotices.push({
      id: "stale",
      priority: NOTICE_PRIORITY.stale,
      node: (
        <div className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3 flex items-center gap-x-4 gap-y-1 flex-wrap">
          <p className="flex-1 min-w-[14rem] text-base font-semibold leading-normal text-amber-950">
            {stored.rulesOutdated
              ? RULES_OUTDATED_INSTRUCTOR_NOTICE
              : stored.repoChanged
              ? REPO_CHANGED_NOTICE
              : "Report may be outdated — membership or settings have changed. Re-analyze to update."}
          </p>
          {!isAdmin && (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={reanalyzing || noRepo}
              className={`ft-hit rounded px-2 text-sm font-semibold text-indigo-800 underline underline-offset-2 hover:text-indigo-900 disabled:cursor-not-allowed disabled:text-slate-600 ${FOCUS_LIGHT}`}
            >
              Re-analyze now
            </button>
          )}
        </div>
      ),
    });
  }
  if (stored && sourceType !== "EDITOR" && stored.unmatchedGitHubLogins.length > 0) {
    reportNotices.push({
      id: "unmatched",
      priority: NOTICE_PRIORITY.unmatchedLogins,
      node: (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-base leading-normal text-amber-950">
          <span className="font-semibold">Unmatched GitHub contributors: </span>
          {stored.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
          repository but are not in the team member list.
        </div>
      ),
    });
  }
  if (stored?.docsDataApproximate) {
    reportNotices.push({
      id: "docs-approximate",
      priority: NOTICE_PRIORITY.docsApproximate,
      node: <DocsDataApproximateNotice fixedAt={stored.docsDataFixedAt} />,
    });
  }

  const quiet = stored && !noActivity ? quietSource(storedMembers as Parameters<typeof quietSource>[0]) : null;
  if (quiet) {
    reportNotices.push({
      id: "quiet-source",
      priority: NOTICE_PRIORITY.quietSource,
      node: (
        <div role="note" className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-base leading-normal text-slate-900">
          {quietSourceText(quiet)}
        </div>
      ),
    });
  }

  const switchBtn = `flex h-8 w-8 items-center justify-center text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 ${FOCUS_LIGHT} focus-visible:-outline-offset-2`;

  return (
    <DocSectionProvider value={(h) => { closeMember(); docSection.open(h); }}>
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Page header */}
      <div className="print:hidden bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-2 pb-4">
          <PageHeader
            breadcrumbs={[
              { label: isAdmin ? "Admin" : "Dashboard", href: dashboardUrl },
              ...(classId ? [{ label: crumbs.classLabel, href: classUrl }] : []),
              ...(assignmentId ? [{ label: crumbs.assignmentLabel, href: assignmentUrl }] : []),
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
                          {g.isAnalyzed && g.teamHealth ? ` · ${presentedHealth(g) === "no-activity" ? NO_ACTIVITY_LABEL : g.teamHealth}` : " · Not analyzed"}
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

                {/* Scoring settings — shown only when a report exists, not for admin. Docs-only projects
                    get the writing weights and flag thresholds. */}
                {stored && !reanalyzing && !isAdmin && stored.assignmentId != null && (
                  <button
                    type="button"
                    onClick={() => setShowScoringModal(true)}
                    title="Adjust scoring weights and flag thresholds for this project (applies to all its groups)"
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
                  <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={reanalyzing || noRepo}
                    title={noRepo ? REPO_NOT_LINKED_MESSAGE : undefined}
                    className={BUTTON_PRIMARY_COMPACT}
                  >
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
                      notFound ? "Analyze" : "Re-analyze now"
                    )}
                  </button>
                )}
              </>
            }
          />
        </div>

        {/* Tab bar — only shown when Document tab is also available */}
        {visibleTabs.length > 1 && (
          <div role="tablist" aria-label="Report sections" className={`${effectiveTab === "tasks" ? "max-w-7xl" : "max-w-6xl"} mx-auto px-4 sm:px-8 flex border-t border-slate-200`}>
            {visibleTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tab}
                onClick={() => selectTab(tab)}
                className={`min-h-10 px-4 text-base font-semibold transition-colors border-b-2 -mb-px ${FOCUS_LIGHT} focus-visible:-outline-offset-2 ${
                  effectiveTab === tab
                    ? "border-indigo-700 text-indigo-800"
                    : "border-transparent text-slate-700 hover:text-slate-900"
                }`}
              >
                {tab === "report" ? "Report" : tab === "tasks" ? "Tasks" : "FairTraze Docs"}
              </button>
            ))}
          </div>
        )}
      </div>

      <main className={`print:hidden flex-1 ${effectiveTab === "tasks" ? "max-w-7xl" : "max-w-6xl"} w-full mx-auto px-4 sm:px-8 py-4 space-y-4 min-w-0`}>

        {/* How fresh the report is, and "Updating…" while a background refresh runs */}
        {stored && !reanalyzing && (
          <LastAnalyzed
            analyzedAt={stored.analyzedAt}
            trigger={stored.trigger}
            updating={updating}
            updateFailed={stored.autoUpdateFailed}
            deadline={stored.deadline}
            analysis={
              <>
                {SOURCE_LABEL[sourceType ?? ""] ?? "GitHub"}
                {sourceType !== "EDITOR" && stored.repoUrl ? (
                  <>
                    {" · "}
                    <a
                      href={stored.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex min-h-8 items-center break-all font-medium text-indigo-800 underline underline-offset-2 hover:text-indigo-900 ${FOCUS_LIGHT}`}
                    >
                      {stored.repoUrl.replace("https://github.com/", "")}
                    </a>
                  </>
                ) : null}
              </>
            }
          />
        )}

        {/* Analysis panel: live while running, completed state while the report reloads */}
        {(reanalyzing || loadingReport) && (
          <AnalysisStepper progress={progress} done={stepperDone} sourceType={sourceType} />
        )}

        {/* No repository yet: guidance with the one next step, not an error */}
        {noRepo && !reanalyzing && (
          <div role="status" className="bg-amber-100 border-2 border-amber-400 rounded-xl px-4 py-3">
            <p className="text-base font-semibold leading-normal text-amber-950">{REPO_NOT_LINKED_PILL}</p>
            <p className="text-base leading-normal text-amber-950">{REPO_NOT_LINKED_MESSAGE} {REPO_NOT_LINKED_HINT}</p>
          </div>
        )}

        {/* Re-analyze error */}
        {reanalyzeError && !reanalyzing && (
          <AnalysisFailedCard message={reanalyzeError} onDismiss={() => setReanalyzeError(null)} />
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
            <Skeleton className="h-16" />
            <Skeleton className="h-64" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        )}

        {/* One notices region: the most important banner, the rest behind "n more notices" */}
        {stored && !reanalyzing && <ReportNotices notices={reportNotices} />}

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

            {/* Summary: one container, one row */}
            <TeamSummaryBar
              noActivity={noActivity}
              teamHealth={stored.report.teamHealth}
              gini={stored.report.gini}
              earlyMuted={earlyMuted}
              confidence={confidence}
              flaggedCount={flagged.length}
              averageGini={benchmark.averageGini}
            />

            {/* Member contributions: also holds the one AI generate button (not shown to admins) */}
            <MemberContributionList
              members={stored.report.members}
              memberRoles={stored.memberRoles}
              thresholds={stored.scoringConfig?.thresholds ?? null}
              mutedFlags={earlyMuted}
              disputedMembers={disputedMembers}
              resolvedFlagOutcomes={resolvedFlagOutcomes}
              aiSummaryState={aiReview.data?.canGenerate ? workSummaryState(aiReview.data) : null}
              generator={isAdmin ? undefined : aiGenerator}
              hasNarrative={!!narrativeText}
              findingsNote={aiReview.data?.enabled && aiReview.data.status === "PARTIAL" ? reviewStatusLine(aiReview.data) : null}
              onOpen={(m, el) => { setDrawerOpener(el); setOpenedName(m.studentName); setSelectedName(m.studentName); }}
            />

            {/* AI report, then the project instructions check inside it. Keyed to projectId so it always reflects the current group */}
            <Narrative
              key={projectId}
              narrative={narrativeText}
              outdated={narrativeOutdated}
              projectId={projectId}
              review={aiReview}
              generator={aiGenerator}
              basedOnAt={stored.analyzedAt}
              teamHealth={noActivity ? null : stored.report.teamHealth}
              repoUrl={sourceType !== "EDITOR" ? stored.repoUrl : null}
              sourceType={sourceType}
              instructionsHref={classId && assignmentId ? assignmentUrl : undefined}
              instructionsAssignmentId={classId && assignmentId ? assignmentId : undefined}
              onNarrativeGenerated={onNarrativeGenerated}
            />
          </>
        )}
          </>
        )}

        {/* ── Tasks tab (read-only for instructors and admins; the server enforces it) ── */}
        {effectiveTab === "tasks" && (
          <TasksTab
            projectId={projectId}
            initialTaskId={initialTaskId}
            onOpenTaskChange={(id) => selectTab("tasks", id)}
            onOpenDocument={visibleTabs.includes("document") ? docFocus.openAt : undefined}
          />
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
              <button type="button" onClick={() => setViewingHistory((v) => !v)} title={viewingHistory ? undefined : HISTORY_HINT} className={`${BUTTON_SECONDARY_COMPACT} ml-auto`}>
                {viewingHistory ? "Back to live document" : "History"}
              </button>
            </div>
            {viewingHistory ? (
              <DocumentHistoryPanel groupId={projectId} />
            ) : (
              <>
                {docFocus.focus?.missing && (
                  <LinkedHeadingNotice projectId={projectId} focus={docFocus.focus} onRelink={docFocus.onRelink} onDismiss={docFocus.clear} />
                )}
                <DocumentGate
                  groupId={projectId}
                  editable={false}
                  canChooseTemplate={false}
                  title={groupName}
                  scrollToHeading={docFocus.focus?.heading ?? docSection.heading}
                  onHeadingResolved={docFocus.focus ? docFocus.onResolved : docSection.onResolved}
                />
              </>
            )}
          </div>
        )}
      </main>

      <AppFooter printHidden />

      {/* Member details drawer */}
      {stored && (
        <MemberDrawer
          member={selectedMember}
          onClose={closeMember}
          restoreFocusTo={drawerOpener}
          position={selectedIdx >= 0 ? { index: selectedIdx, total: reportMembers.length } : undefined}
          onPrev={() => selectedIdx > 0 && setSelectedName(reportMembers[selectedIdx - 1].studentName)}
          onNext={() => selectedIdx >= 0 && selectedIdx < reportMembers.length - 1 && setSelectedName(reportMembers[selectedIdx + 1].studentName)}
          source={flagSource}
          thresholds={stored.scoringConfig?.thresholds ?? null}
          deadlineBasis={stored.report.deadlineWindowBasis ?? null}
          memberCount={stored.report.memberCount}
          memberRoles={stored.memberRoles}
          flagsMuted={earlyMuted}
          flagsMayChange={confidence === "medium"}
          rulesVersion={stored.scoringRulesVersion ?? null}
          docsOneGo={stored.docsOneGo}
          onOpenDocumentHistory={visibleTabs.includes("document") ? () => { setSelectedName(null); setViewingHistory(true); selectTab("document"); } : undefined}
          disputed={selectedMember ? disputedMembers.has(selectedMember.studentName) : false}
          flagOutcomes={selectedMember ? resolvedFlagOutcomes.get(selectedMember.studentName) : undefined}
          onOpenDisputes={() => { setSelectedName(null); navigate("/disputes"); }}
          onOpenScoringSettings={() => { setSelectedName(null); setShowScoringModal(true); }}
          workSummary={selectedMember ? (
            <MemberWorkSummary
              review={aiReview.data}
              onGenerate={() => { void aiGenerator.generate(!!narrativeText); }}
              generating={aiGenerator.generating}
              sourceType={sourceType}
              member={{ userId: (selectedMember as { userId?: number }).userId, githubUsername: (selectedMember as { githubUsername?: string }).githubUsername }}
            />
          ) : undefined}
        />
      )}

      {/* Print-only layout — hidden on screen, rendered when printing */}
      {stored && !reanalyzing && (
        <PrintableReport stored={stored} meta={projectMeta} />
      )}

      {/* Scoring settings modal */}
      {showScoringModal && stored && (
        <ScoringSettingsModal
          assignmentId={stored.assignmentId!}
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
    </DocSectionProvider>
  );
}
