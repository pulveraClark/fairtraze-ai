import { useEffect, useState, useCallback } from "react";
import type { StoredReportResponse, ProjectSummaryItem } from "@shared/types";
import { AppTopBar } from "../components/AppTopBar";
import { TeamHealthBanner } from "../components/TeamHealthBanner";
import { ContributionChart } from "../components/ContributionChart";
import { MemberTable } from "../components/MemberTable";
import { Narrative } from "../components/Narrative";
import { AnalysisStepper } from "../components/AnalysisStepper";
import { FairTrazeDocsPreview } from "../components/FairTrazeDocsPreview";
import { PrintableReport } from "../components/PrintableReport";
import { parseClassLabel } from "../components/ClassCard";
import { useRouter } from "../router";

const SOURCE_LABEL: Record<string, string> = {
  GITHUB:   "GitHub",
  EDITOR:   "FairTraze Docs",
  COMBINED: "GitHub + Docs",
};

interface Props {
  projectId: number;
}

export function ProjectDetailPage({ projectId }: Props) {
  const { navigate } = useRouter();

  const [stored, setStored]               = useState<StoredReportResponse | null>(null);
  const [narrativeText, setNarrativeText] = useState<string | null>(null);
  const [fetchError, setFetchError]       = useState<string | null>(null);
  const [notFound, setNotFound]           = useState(false);
  const [reanalyzing, setReanalyzing]     = useState(false);
  const [stepperDone, setStepperDone]     = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  // Summary used for breadcrumb + group switcher
  const [projectMeta, setProjectMeta] = useState<ProjectSummaryItem | null>(null);
  const [siblings, setSiblings]       = useState<ProjectSummaryItem[]>([]);

  const fetchStored = useCallback(async () => {
    setFetchError(null);
    setNotFound(false);
    setStored(null);
    setNarrativeText(null);   // clear immediately so no previous group's text bleeds through
    try {
      const res = await fetch(`/api/projects/${projectId}/report`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setFetchError(data.error ?? `Server error ${res.status}`);
        return;
      }
      const data = (await res.json()) as StoredReportResponse;
      setStored(data);
      setNarrativeText(data.narrative ?? null);
    } catch {
      setFetchError("Network error — could not reach the server.");
    }
  }, [projectId]);

  const fetchSummary = useCallback(async () => {
    try {
      const res  = await fetch("/api/projects/summary");
      const data = (await res.json()) as { summary: ProjectSummaryItem[] };
      const current = data.summary.find((g) => g.projectId === projectId) ?? null;
      setProjectMeta(current);
      if (current) {
        const list = data.summary
          .filter((g) => g.assignmentLabel === current.assignmentLabel)
          .sort((a, b) => a.groupName.localeCompare(b.groupName));
        setSiblings(list);
      }
    } catch {
      // non-critical — breadcrumb degrades to Dashboard only
    }
  }, [projectId]);

  useEffect(() => {
    void fetchStored();
    void fetchSummary();
  }, [fetchStored, fetchSummary]);

  async function handleAnalyze() {
    setReanalyzing(true);
    setStepperDone(false);
    setReanalyzeError(null);
    try {
      const res  = await fetch(`/api/projects/${projectId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setReanalyzeError((data as { error?: string }).error ?? `Server error ${res.status}`);
        return;
      }
      setStepperDone(true);
      await new Promise((r) => setTimeout(r, 800));
      await fetchStored();
      await fetchSummary();   // refresh health labels in switcher
      setNotFound(false);
    } catch {
      setReanalyzeError("Network error — could not reach the server.");
    } finally {
      setReanalyzing(false);
    }
  }

  // ── Source visibility ─────────────────────────────────────────────────────
  const sourceType = stored?.sourceType ?? null;
  const showGitHub = sourceType !== "EDITOR";   // GITHUB, COMBINED, or legacy (null) → show GitHub
  const showDocs   = sourceType === "EDITOR" || sourceType === "COMBINED";

  // ── Breadcrumb derivation ──────────────────────────────────────────────────
  const assignmentLabel = projectMeta?.assignmentLabel ?? "";
  const { code, subjectName } = assignmentLabel ? parseClassLabel(assignmentLabel) : { code: "", subjectName: "" };

  const classId      = projectMeta?.classId ?? null;
  const assignmentId = projectMeta?.assignmentId ?? null;

  const classUrl      = classId      ? `/class/${classId}`                              : "/dashboard";
  const assignmentUrl = classId && assignmentId ? `/class/${classId}/assignment/${assignmentId}` : classUrl;

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
                onClick={() => navigate("/dashboard")}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
              >
                Dashboard
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
                  {stored.name}
                  {" · "}
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

            {/* Re-analyze / Analyze button */}
            {!reanalyzing && (
              <button
                onClick={handleAnalyze}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {notFound ? "Analyze" : "Re-analyze"}
              </button>
            )}
          </div>
        </div>
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
                  <span className="text-slate-400 text-xs block mb-0.5">App / Project</span>
                  <p className="font-medium text-slate-800">{stored.name}</p>
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
            </div>

            {/* GitHub-specific sections */}
            {showGitHub && (
              <>
                {/* Team health */}
                <TeamHealthBanner
                  teamHealth={stored.report.teamHealth}
                  gini={stored.report.gini}
                  projectName={stored.groupName}
                  memberCount={stored.report.memberCount}
                />

                {/* Contribution profiling */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-700">Contribution Profiling — GitHub</h2>
                  </div>
                  <div className="px-6 pt-4 pb-2">
                    <ContributionChart members={stored.report.members} />
                  </div>
                  <MemberTable members={stored.report.members} />
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

            {/* FairTraze Docs section — shown for EDITOR and COMBINED */}
            {showDocs && (
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

            {/* Timestamp */}
            <p className="text-xs text-slate-400 text-right">
              Report generated {new Date(stored.analyzedAt).toLocaleString()}
            </p>
          </>
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
    </div>
  );
}
