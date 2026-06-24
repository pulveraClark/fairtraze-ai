import { useEffect, useState, useCallback } from "react";
import type { ProjectSummaryItem } from "@shared/types";
import { AppTopBar } from "../components/AppTopBar";
import { GroupSummaryCard } from "../components/GroupSummaryCard";
import { ClassCard, parseClassLabel, classAtRiskCount } from "../components/ClassCard";
import { useRouter } from "../router";
import { useAuth } from "../context/AuthContext";

// ── Lifecycle API types ───────────────────────────────────────────────────────
interface LifecycleAssignment {
  id: number;
  title: string;
  deadline: string | null;
  maxGroupSize: number;
  sourceType: "GITHUB" | "EDITOR" | "COMBINED";
  joinCode: string;
  createdAt: string;
  _count: { projects: number };
}

interface LifecycleClass {
  id: number;
  subjectCode: string;
  subjectName: string;
  course: string;
  edpCode: string;
  type: "LECTURE" | "LABORATORY";
  instructorId: number;
  createdAt: string;
  assignments: LifecycleAssignment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type SortMode   = "risk" | "name";
type FilterMode = "all" | "at-risk";

// Normalize subject code for loose matching against assignmentLabel strings
// e.g. "IT-ELEC 2" and "IT-ELEC2" both → "it-elec2"
function normalizeCode(code: string): string {
  return code.replace(/\s/g, "").toLowerCase();
}

function riskScore(item: ProjectSummaryItem): number {
  if (!item.isAnalyzed) return 10;
  const hasFlags = item.flagsPresent.length > 0;
  if (item.teamHealth === "High Risk")     return hasFlags ? 0 : 1;
  if (item.teamHealth === "Moderate Risk") return hasFlags ? 2 : 3;
  return hasFlags ? 4 : 5;
}

function sortGroups(items: ProjectSummaryItem[], mode: SortMode): ProjectSummaryItem[] {
  return [...items].sort((a, b) => {
    if (mode === "risk") {
      const diff = riskScore(a) - riskScore(b);
      return diff !== 0 ? diff : a.groupName.localeCompare(b.groupName);
    }
    return a.groupName.localeCompare(b.groupName);
  });
}

function sortClasses(
  classes: LifecycleClass[],
  mode: SortMode,
  getItems: (cls: LifecycleClass) => ProjectSummaryItem[]
): LifecycleClass[] {
  return [...classes].sort((a, b) => {
    if (mode === "name") return a.subjectCode.localeCompare(b.subjectCode);
    const aRisk = classAtRiskCount(getItems(a));
    const bRisk = classAtRiskCount(getItems(b));
    return bRisk !== aRisk ? bRisk - aRisk : a.subjectCode.localeCompare(b.subjectCode);
  });
}

// ── Create Class Section modal ────────────────────────────────────────────────
function CreateClassModal({
  token,
  onClose,
  onCreated,
}: {
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [course, setCourse]           = useState("BSIT");
  const [edpCode, setEdpCode]         = useState("");
  const [classType, setClassType]     = useState<"LECTURE" | "LABORATORY">("LECTURE");
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectCode.trim() || !subjectName.trim() || !edpCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/classes", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          subjectCode: subjectCode.trim(),
          subjectName: subjectName.trim(),
          course:      course.trim() || "BSIT",
          edpCode:     edpCode.trim(),
          type:        classType,
        }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to create class section");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Create Class Section</h2>
            <p className="text-xs text-slate-400 mt-0.5">Add a new subject to your dashboard</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Subject code</label>
                <input
                  required
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value)}
                  placeholder="e.g. CC-APPSDEV22"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">EDP code</label>
                <input
                  required
                  value={edpCode}
                  onChange={(e) => setEdpCode(e.target.value)}
                  placeholder="e.g. 31400"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Subject name</label>
              <input
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="e.g. Applications Development"
                className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Program / Course</label>
                <input
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  placeholder="e.g. BSIT"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Type</label>
                <select
                  value={classType}
                  onChange={(e) => setClassType(e.target.value as "LECTURE" | "LABORATORY")}
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                >
                  <option value="LECTURE">Lecture</option>
                  <option value="LABORATORY">Laboratory</option>
                </select>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={submitting || !subjectCode.trim() || !subjectName.trim() || !edpCode.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create Class Section
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Reusable confirmation dialog ──────────────────────────────────────────────
function ConfirmDialog({
  title,
  body,
  confirmLabel = "Delete",
  typeToConfirm,
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  typeToConfirm?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
}) {
  const [typedValue, setTypedValue] = useState("");
  const canConfirm = !typeToConfirm || typedValue === typeToConfirm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">{title}</h2>
          <div className="text-xs text-slate-500 leading-relaxed">{body}</div>
          {typeToConfirm && (
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Type <span className="font-mono font-bold text-slate-800">{typeToConfirm}</span> to confirm
              </label>
              <input
                type="text"
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                placeholder={typeToConfirm}
                autoFocus
                className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-sm text-slate-800 placeholder-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              />
            </div>
          )}
          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t border-slate-100 mt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !canConfirm}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold transition-colors"
          >
            {busy ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Deleting…
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
export function DemoPage() {
  const { navigate }    = useRouter();
  const { token }       = useAuth();

  const [classes, setClasses]         = useState<LifecycleClass[]>([]);
  const [summary, setSummary]         = useState<ProjectSummaryItem[]>([]);
  const [loadError, setLoadError]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [sortMode, setSortMode]       = useState<SortMode>("risk");
  const [filterMode, setFilterMode]   = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [analyzing, setAnalyzing]     = useState<Set<number>>(new Set());
  const [showClassModal, setShowClassModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LifecycleClass | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteError, setDeleteError]   = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    const res  = await fetch("/api/projects/summary");
    const data = (await res.json()) as { summary: ProjectSummaryItem[] };
    setSummary(data.summary);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [classesRes, summaryRes] = await Promise.all([
        fetch("/api/classes", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/projects/summary"),
      ]);
      if (!classesRes.ok) throw new Error("Could not load classes");
      const classesData = (await classesRes.json()) as { classes: LifecycleClass[] };
      const summaryData = (await summaryRes.json()) as { summary: ProjectSummaryItem[] };
      setClasses(classesData.classes);
      setSummary(summaryData.summary);
      setLoadError(null);
    } catch {
      setLoadError("Could not load dashboard — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleDeleteClass() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/classes/${deleteTarget.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchData();
      } else {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? "Failed to delete class section");
      }
    } catch {
      setDeleteError("Network error — is the server running?");
    } finally {
      setDeleting(false);
    }
  }

  async function handleReanalyze(projectId: number) {
    setAnalyzing((prev) => new Set(prev).add(projectId));
    try {
      await fetch(`/api/projects/${projectId}/analyze`, { method: "POST" });
      await fetchSummary();
    } finally {
      setAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  }

  // Match lifecycle class to summary items by normalised subject code
  function getItemsForClass(cls: LifecycleClass): ProjectSummaryItem[] {
    const clsNorm = normalizeCode(cls.subjectCode);
    return summary.filter((item) => {
      const { code } = parseClassLabel(item.assignmentLabel);
      return normalizeCode(code) === clsNorm;
    });
  }

  // Global at-risk count
  const atRiskCount = summary.filter(
    (i) => i.isAnalyzed && (i.teamHealth === "High Risk" || i.teamHealth === "Moderate Risk" || i.flagsPresent.length > 0)
  ).length;

  const isSearchMode = searchQuery.trim().length > 0;
  const isAtRiskMode = !isSearchMode && filterMode === "at-risk";
  const isNormalMode = !isSearchMode && !isAtRiskMode;

  const sortedClasses = sortClasses(classes, sortMode, getItemsForClass);

  const atRiskGroups = sortGroups(
    summary.filter(
      (i) => i.isAnalyzed && (i.teamHealth === "High Risk" || i.teamHealth === "Moderate Risk" || i.flagsPresent.length > 0)
    ),
    sortMode
  );

  const q = searchQuery.trim().toLowerCase();
  const matchedClasses = isSearchMode
    ? classes.filter(
        (cls) => cls.subjectCode.toLowerCase().includes(q) || cls.subjectName.toLowerCase().includes(q)
      )
    : [];
  const matchedGroups = isSearchMode
    ? summary.filter((i) => i.groupName.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showClassModal && (
        <CreateClassModal
          token={token}
          onClose={() => setShowClassModal(false)}
          onCreated={() => void fetchData()}
        />
      )}
      {deleteTarget && (() => {
        const nProjects = deleteTarget.assignments.length;
        const nGroups   = deleteTarget.assignments.reduce((s, a) => s + a._count.projects, 0);
        return (
          <ConfirmDialog
            title={`Delete "${deleteTarget.subjectCode} — ${deleteTarget.subjectName}"?`}
            body={
              <>
                {(nProjects > 0 || nGroups > 0) && (
                  <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 font-semibold text-red-700">
                    This will permanently delete {nProjects} project{nProjects !== 1 ? "s" : ""} and {nGroups} group{nGroups !== 1 ? "s" : ""}, including all stored reports.
                  </div>
                )}
                This will permanently remove the class section and all its contents. This cannot be undone.
              </>
            }
            confirmLabel="Delete class section"
            typeToConfirm={deleteTarget.subjectCode}
            onConfirm={() => void handleDeleteClass()}
            onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
            busy={deleting}
            error={deleteError}
          />
        );
      })()}
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-sm font-semibold text-slate-800">Instructor Dashboard</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Group contribution overview · GitHub analysis · Collaborative Editor coming soon
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowClassModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Class Section
            </button>
            {atRiskCount > 0 && (
              <button
                onClick={() => { setFilterMode("at-risk"); setSearchQuery(""); }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                  isAtRiskMode
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

        {/* Search bar */}
        <div className="relative mb-4">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search subjects or groups…"
            className="w-full sm:w-80 pl-8 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs leading-none" aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {/* Sort / filter controls */}
        {!isSearchMode && (
          <div className="flex items-center gap-3 mb-6 flex-wrap">
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
                {mode === "all" ? "All classes" : "At-risk only"}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 py-16 text-slate-400 text-sm justify-center">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            Loading dashboard…
          </div>
        )}

        {/* Error */}
        {loadError && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{loadError}</div>
        )}

        {/* Normal mode: class card grid */}
        {!loading && !loadError && isNormalMode && (
          sortedClasses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">No classes yet</p>
                <p className="text-xs text-slate-400 mt-1">Create your first class section to get started.</p>
              </div>
              <button
                onClick={() => setShowClassModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create first class section
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {sortedClasses.map((cls) => (
                <ClassCard
                  key={cls.id}
                  assignmentLabel={`${cls.subjectCode} — ${cls.subjectName}`}
                  items={getItemsForClass(cls)}
                  onClick={() => navigate(`/class/${cls.id}`)}
                  edpCode={cls.edpCode || undefined}
                  classType={cls.type}
                  onDelete={() => { setDeleteTarget(cls); setDeleteError(null); }}
                  projectCount={cls.assignments.length}
                />
              ))}
            </div>
          )
        )}

        {/* At-risk mode */}
        {!loading && !loadError && isAtRiskMode && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-slate-700">At-risk groups — all classes</h2>
              <button onClick={() => setFilterMode("all")} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
                ← Back to classes
              </button>
            </div>
            {atRiskGroups.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No at-risk groups found.{" "}
                <button onClick={() => setFilterMode("all")} className="underline hover:text-slate-600">Show all classes</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {atRiskGroups.map((item) => (
                  <div key={item.projectId}>
                    <p className="text-[11px] font-mono font-semibold text-slate-400 mb-1.5 truncate">
                      {parseClassLabel(item.assignmentLabel).code}
                    </p>
                    <GroupSummaryCard item={item} onAnalyze={handleReanalyze} analyzing={analyzing.has(item.projectId)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Search mode */}
        {!loading && !loadError && isSearchMode && (
          <>
            {matchedClasses.length === 0 && matchedGroups.length === 0 && (
              <div className="text-center py-16 text-slate-400 text-sm">
                No subjects or groups match <span className="font-medium text-slate-600">"{searchQuery}"</span>.{" "}
                <button onClick={() => setSearchQuery("")} className="underline hover:text-slate-600">Clear search</button>
              </div>
            )}

            {matchedClasses.length > 0 && (
              <div className="mb-7">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Subjects</h2>
                <div className="space-y-2">
                  {matchedClasses.map((cls) => {
                    const items  = getItemsForClass(cls);
                    const atRisk = classAtRiskCount(items);
                    return (
                      <button
                        key={cls.id}
                        onClick={() => navigate(`/class/${cls.id}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all text-left"
                      >
                        <div className="shrink-0 w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-indigo-600 leading-none text-center px-0.5">
                            {cls.subjectCode.slice(0, 4)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 font-mono">{cls.subjectCode}</p>
                          <p className="text-xs text-slate-500 truncate">{cls.subjectName}</p>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">
                          {items.length} group{items.length !== 1 ? "s" : ""}
                        </span>
                        {atRisk > 0 && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700 whitespace-nowrap">
                            ⚠ {atRisk} at risk
                          </span>
                        )}
                        <svg className="shrink-0 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {matchedGroups.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Groups</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {matchedGroups.map((item) => (
                    <GroupSummaryCard key={item.projectId} item={item} onAnalyze={handleReanalyze} analyzing={analyzing.has(item.projectId)} />
                  ))}
                </div>
              </div>
            )}
          </>
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
