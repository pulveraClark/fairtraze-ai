import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@shared/types";
import { AppSidebar } from "../components/AppSidebar";
import { ProjectSelector } from "../components/ProjectSelector";
import { TeamHealthBanner } from "../components/TeamHealthBanner";
import { ContributionChart } from "../components/ContributionChart";
import { MemberTable } from "../components/MemberTable";
import { Narrative } from "../components/Narrative";
import { AnalysisStepper } from "../components/AnalysisStepper";

interface ProjectSummary {
  id: number;
  name: string;
  repoUrl: string;
}

export function DemoPage() {
  const [projects, setProjects]           = useState<ProjectSummary[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedId, setSelectedId]       = useState<number | null>(null);
  const [loading, setLoading]             = useState(false);
  const [stepperDone, setStepperDone]     = useState(false);
  const [result, setResult]               = useState<AnalyzeResponse | null>(null);
  const [analyzeError, setAnalyzeError]   = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: { projects: ProjectSummary[] }) => setProjects(data.projects))
      .catch(() => setProjectsError("Could not load projects. Is the server running?"));
  }, []);

  async function handleAnalyze() {
    if (selectedId === null) return;
    setLoading(true);
    setStepperDone(false);
    setAnalyzeError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/projects/${selectedId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      setStepperDone(true);
      await new Promise((r) => setTimeout(r, 800));
      setResult(data as AnalyzeResponse);
    } catch {
      setAnalyzeError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <AppSidebar />

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="px-8 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold text-slate-800">Analyze Project</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                GitHub analysis · Collaborative Editor coming in Phase D
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Demo — seeded projects
            </span>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 px-8 py-8 max-w-4xl w-full mx-auto space-y-6">

          {/* Project selector card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-1">
              Generate a Contribution Fairness Report
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Select a project and click Analyze. The system fetches GitHub activity,
              scores each member deterministically, detects participation imbalance, and
              generates an AI-written fairness narrative. Collaborative Editor analysis
              is the planned second data source (Phase D).
            </p>

            {projectsError ? (
              <p className="text-sm text-red-600">{projectsError}</p>
            ) : (
              <ProjectSelector
                projects={projects}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onAnalyze={handleAnalyze}
                loading={loading}
              />
            )}
          </div>

          {/* Loading stepper */}
          {loading && <AnalysisStepper done={stepperDone} />}

          {/* Error */}
          {analyzeError && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
              <span className="text-red-400 mt-0.5 text-base leading-none">&#9888;</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Analysis failed</p>
                <p className="text-sm text-red-700 mt-0.5">{analyzeError}</p>
              </div>
              <button
                onClick={() => setAnalyzeError(null)}
                className="text-red-400 hover:text-red-600 text-lg leading-none"
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Report header */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
                  Report Details
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Project</span>
                    <p className="font-medium text-slate-800">
                      {selectedProject?.name ?? `Project ${result.projectId}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Source</span>
                    <p className="font-medium text-slate-800">GitHub</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Repository</span>
                    <a
                      href={result.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-indigo-600 hover:underline break-all"
                    >
                      {result.repoUrl}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Analyzed</span>
                    <p className="font-medium text-slate-800">
                      {new Date(result.analyzedAt).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Members</span>
                    <p className="font-medium text-slate-800">{result.report.memberCount}</p>
                  </div>
                </div>
              </div>

              {/* Team health */}
              <TeamHealthBanner
                teamHealth={result.report.teamHealth}
                gini={result.report.gini}
                projectName={selectedProject?.name ?? `Project ${result.projectId}`}
                memberCount={result.report.memberCount}
              />

              {/* Contribution profiling */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-700">Contribution Profiling</h2>
                </div>
                <div className="px-6 pt-4 pb-2">
                  <ContributionChart members={result.report.members} />
                </div>
                <MemberTable members={result.report.members} />
              </div>

              {/* Explainable narrative */}
              <Narrative narrative={result.narrative} projectId={result.projectId} />

              {/* Unmatched logins */}
              {result.unmatchedGitHubLogins.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                  <span className="font-semibold">Unmatched GitHub contributors: </span>
                  {result.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
                  repository but are not in the team member list.
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-slate-400 text-right">
                Report generated {new Date(result.analyzedAt).toLocaleString()}
              </p>
            </>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white">
          <div className="px-8 py-3 text-xs text-slate-400 text-center">
            Outputs are evidence to support instructor judgment — they do not constitute grades or
            final assessments.
          </div>
        </footer>
      </div>
    </div>
  );
}
