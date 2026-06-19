import { useEffect, useState } from "react";
import type { AnalyzeResponse } from "@shared/types";
import { ProjectSelector } from "./components/ProjectSelector";
import { TeamHealthBanner } from "./components/TeamHealthBanner";
import { ContributionChart } from "./components/ContributionChart";
import { MemberTable } from "./components/MemberTable";
import { Narrative } from "./components/Narrative";
import { SystemOverview } from "./components/SystemOverview";
import { AnalysisStepper } from "./components/AnalysisStepper";
import { ScopeLegend } from "./components/ScopeLegend";
import { SignificanceTable } from "./components/SignificanceTable";

interface ProjectSummary {
  id: number;
  name: string;
  repoUrl: string;
}

type Tab = "overview" | "analyze";

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [stepperDone, setStepperDone] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

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
    setTab("analyze");

    try {
      const res = await fetch(`/api/projects/${selectedId}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error ?? `Server returned ${res.status}`);
        return;
      }
      setStepperDone(true);
      // Small delay so the stepper's final step is briefly visible before results replace it
      await new Promise((r) => setTimeout(r, 800));
      setResult(data as AnalyzeResponse);
    } catch {
      setAnalyzeError("Network error — could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  const navItems: { id: Tab; label: string }[] = [
    { id: "overview", label: "System Overview" },
    { id: "analyze", label: "Analyze Project" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex items-center justify-between py-3">
            <div>
              <span className="text-base font-bold text-slate-900">FAIR TRAZE AI</span>
              <span className="ml-2 text-xs text-slate-400 hidden sm:inline">
                GitHub Contribution Fairness Analyzer
              </span>
            </div>
          </div>
          {/* Tab nav */}
          <nav className="flex gap-0 -mb-px">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === item.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {/* ── SYSTEM OVERVIEW TAB ── */}
        {tab === "overview" && <SystemOverview />}

        {/* ── ANALYZE TAB ── */}
        {tab === "analyze" && (
          <div className="space-y-6">
            {/* Project selector */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-1">
                Generate a Contribution Fairness Report
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Select a monitored project and click Analyze. The system will fetch GitHub activity,
                score each member, detect participation imbalance, and generate an AI-assisted
                fairness narrative.
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

            {/* Stepper (loading) */}
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
                <ScopeLegend />

                <TeamHealthBanner
                  teamHealth={result.report.teamHealth}
                  gini={result.report.gini}
                  projectName={selectedProject?.name ?? `Project ${result.projectId}`}
                />

                <ContributionChart members={result.report.members} />

                <MemberTable members={result.report.members} />

                <SignificanceTable members={result.report.members} />

                <Narrative narrative={result.narrative} />

                {result.unmatchedGitHubLogins.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <span className="font-semibold">Unmatched GitHub contributors: </span>
                    {result.unmatchedGitHubLogins.join(", ")} — these logins contributed to the
                    repository but are not in the team member list.
                  </div>
                )}

                <p className="text-xs text-slate-400 text-right">
                  Report generated {new Date(result.analyzedAt).toLocaleString()}
                </p>
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-3 text-xs text-slate-400 text-center">
          Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
        </div>
      </footer>
    </div>
  );
}
