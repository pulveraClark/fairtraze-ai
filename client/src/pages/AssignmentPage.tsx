import { useEffect, useState, useCallback } from "react";
import type { ProjectSummaryItem } from "@shared/types";
import { AppTopBar } from "../components/AppTopBar";
import { GroupSummaryCard } from "../components/GroupSummaryCard";
import { GroupManageModal } from "../components/GroupManageModal";
import { classAtRiskCount } from "../components/ClassCard";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";

// ── Lifecycle API types ───────────────────────────────────────────────────────
interface AssignmentMeta {
  id: number;
  title: string;
  joinCode: string;
  deadline: string | null;
  maxGroupSize: number;
  sourceType: "GITHUB" | "EDITOR" | "COMBINED";
  createdAt: string;
  classSectionId: number;
}

interface ClassInfo {
  id: number;
  subjectCode: string;
  subjectName: string;
  course: string;
  edpCode: string;
  type: "LECTURE" | "LABORATORY";
}

interface LifecycleGroup {
  id: number;
  groupName: string;
  name: string;
  repoUrl: string;
  memberCount: number;
  lastAnalyzedAt: string | null;
  isAnalyzed: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type SortMode   = "risk" | "name";
type FilterMode = "all" | "at-risk";

function riskScore(item: ProjectSummaryItem): number {
  if (!item.isAnalyzed) return 10;
  const hasFlags = item.flagsPresent.length > 0;
  if (item.teamHealth === "High Risk")     return hasFlags ? 0 : 1;
  if (item.teamHealth === "Moderate Risk") return hasFlags ? 2 : 3;
  return hasFlags ? 4 : 5;
}

function sortItems(items: ProjectSummaryItem[], mode: SortMode): ProjectSummaryItem[] {
  return [...items].sort((a, b) => {
    if (mode === "risk") {
      const diff = riskScore(a) - riskScore(b);
      return diff !== 0 ? diff : a.groupName.localeCompare(b.groupName);
    }
    return a.groupName.localeCompare(b.groupName);
  });
}

function filterItems(items: ProjectSummaryItem[], mode: FilterMode): ProjectSummaryItem[] {
  if (mode === "all") return items;
  return items.filter(
    (i) => i.teamHealth === "High Risk" || i.teamHealth === "Moderate Risk" || i.flagsPresent.length > 0
  );
}

function fmtDeadline(iso: string | null): string {
  if (!iso) return "No deadline";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Page component ────────────────────────────────────────────────────────────
interface Props { classId: number; assignmentId: number }

export function AssignmentPage({ classId, assignmentId }: Props) {
  const { navigate } = useRouter();
  const { token, user } = useAuth();
  const isAdmin = user?.systemRole === "ADMIN";
  const dashboardUrl = isAdmin ? "/admin" : "/dashboard";

  const [assignment, setAssignment] = useState<AssignmentMeta | null>(null);
  const [classInfo, setClassInfo]   = useState<ClassInfo | null>(null);
  const [summary, setSummary]       = useState<ProjectSummaryItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [sortMode, setSortMode]     = useState<SortMode>("risk");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [search, setSearch]         = useState("");
  const [analyzing, setAnalyzing]       = useState<Set<number>>(new Set());
  const [managingGroupId, setManagingGroupId] = useState<number | null>(null);

  const fetchSummaryForAssignment = useCallback(
    async (groups: LifecycleGroup[]) => {
      const ids       = new Set(groups.map((g) => g.id));
      const res       = await fetch("/api/projects/summary");
      const data      = (await res.json()) as { summary: ProjectSummaryItem[] };
      setSummary(data.summary.filter((i) => ids.has(i.projectId)));
    },
    []
  );

  const fetchData = useCallback(async () => {
    try {
      const [assignRes, classRes] = await Promise.all([
        fetch(`/api/assignments/${assignmentId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/classes/${classId}/assignments`,  { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!assignRes.ok) {
        setLoadError(assignRes.status === 403 ? "You do not have access to this project." : "Project not found.");
        return;
      }

      const assignData = (await assignRes.json()) as { assignment: AssignmentMeta; groups: LifecycleGroup[] };
      const classData  = classRes.ok
        ? ((await classRes.json()) as { class: ClassInfo })
        : null;

      setAssignment(assignData.assignment);
      if (classData) setClassInfo(classData.class);

      await fetchSummaryForAssignment(assignData.groups);
      setLoadError(null);
    } catch {
      setLoadError("Could not load project data — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [assignmentId, classId, token, fetchSummaryForAssignment]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleReanalyze(projectId: number) {
    setAnalyzing((prev) => new Set(prev).add(projectId));
    try {
      await fetch(`/api/projects/${projectId}/analyze`, { method: "POST" });
      // Re-fetch just the summary after re-analysis
      if (assignment) {
        const res  = await fetch(`/api/assignments/${assignmentId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { groups: LifecycleGroup[] };
        await fetchSummaryForAssignment(data.groups);
      }
    } finally {
      setAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  const sorted      = filterItems(sortItems(summary, sortMode), filterMode);
  const processed   = search.trim()
    ? sorted.filter((i) => i.groupName.toLowerCase().includes(search.trim().toLowerCase()))
    : sorted;
  const atRiskCount = classAtRiskCount(summary);
  const classUrl    = `/class/${classId}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {managingGroupId !== null && (
        <GroupManageModal
          projectId={managingGroupId}
          isInstructor={true}
          onClose={() => setManagingGroupId(null)}
          onChanged={() => void fetchData()}
        />
      )}

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button onClick={() => navigate(dashboardUrl)} className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium">
              {isAdmin ? "Admin" : "Dashboard"}
            </button>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <button onClick={() => navigate(classUrl)} className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium font-mono">
              {classInfo?.subjectCode ?? "…"}
            </button>
            <span className="text-slate-300 text-xs shrink-0">›</span>
            <div className="min-w-0">
              {assignment ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm font-semibold text-slate-800 truncate">{assignment.title}</h1>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                    {assignment.sourceType}
                  </span>
                </div>
              ) : (
                <h1 className="text-sm font-semibold text-slate-400">Loading…</h1>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                {classInfo?.subjectName && <span className="mr-1">{classInfo.subjectName} ·</span>}
                {summary.length} group{summary.length !== 1 ? "s" : ""}
                {assignment?.deadline && <span className="ml-1">· Deadline: {fmtDeadline(assignment.deadline)}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {isAdmin && (
              <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                Admin view — read only
              </span>
            )}
            {atRiskCount > 0 && (
              <button
                onClick={() => setFilterMode(filterMode === "at-risk" ? "all" : "at-risk")}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                  filterMode === "at-risk"
                    ? "bg-red-100 border-red-300 text-red-800"
                    : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {atRiskCount} group{atRiskCount !== 1 ? "s" : ""} need attention
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8">

        {/* Search + Sort / filter controls */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groups…"
              className="pl-8 pr-3 py-1 rounded-full text-xs text-slate-700 bg-white border border-slate-200 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-40"
            />
          </div>
          <span className="text-slate-200 hidden sm:block">|</span>
          <span className="text-xs font-medium text-slate-500">Sort:</span>
          {(["risk", "name"] as SortMode[]).map((mode) => (
            <button key={mode} onClick={() => setSortMode(mode)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                sortMode === mode ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >
              {mode === "risk" ? "By risk (default)" : "By name"}
            </button>
          ))}
          <span className="text-slate-200 mx-1 hidden sm:block">|</span>
          <span className="text-xs font-medium text-slate-500">Show:</span>
          {(["all", "at-risk"] as FilterMode[]).map((mode) => (
            <button key={mode} onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filterMode === mode ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >
              {mode === "all" ? "All groups" : "At-risk only"}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-16 text-slate-400 text-sm justify-center">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            Loading groups…
          </div>
        )}

        {loadError && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{loadError}</div>
        )}

        {!loading && !loadError && processed.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">
            {search.trim() ? (
              <>
                No groups match &ldquo;{search}&rdquo;.{" "}
                <button onClick={() => setSearch("")} className="underline hover:text-slate-600">Clear search</button>
              </>
            ) : filterMode === "at-risk" ? (
              <>
                No at-risk groups in this project.{" "}
                <button onClick={() => setFilterMode("all")} className="underline hover:text-slate-600">Show all groups</button>
              </>
            ) : (
              "No groups found for this project."
            )}
          </div>
        )}

        {!loading && !loadError && processed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {processed.map((item) => (
              <GroupSummaryCard
                key={item.projectId}
                item={item}
                onAnalyze={isAdmin ? undefined : handleReanalyze}
                analyzing={analyzing.has(item.projectId)}
                onManage={isAdmin ? undefined : (id) => setManagingGroupId(id)}
              />
            ))}
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
    </div>
  );
}
