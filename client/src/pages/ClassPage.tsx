import { useEffect, useState, useCallback } from "react";
import type { ProjectSummaryItem } from "@shared/types";
import { AppTopBar } from "../components/AppTopBar";
import { classAtRiskCount } from "../components/ClassCard";
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

interface ClassInfo {
  id: number;
  subjectCode: string;
  subjectName: string;
  course: string;
  edpCode: string;
  type: "LECTURE" | "LABORATORY";
  createdAt: string;
}

interface AssignmentGroup {
  id: number;
  groupName: string;
  name: string;
  repoUrl: string;
  memberCount: number;
  lastAnalyzedAt: string | null;
  isAnalyzed: boolean;
}

// ── Gradient palette (matches ClassCard) ─────────────────────────────────────
const BAND_GRADIENTS = [
  "linear-gradient(135deg, #4338ca 0%, #6366f1 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #6d28d9 0%, #a78bfa 100%)",
  "linear-gradient(135deg, #be123c 0%, #f43f5e 100%)",
  "linear-gradient(135deg, #b45309 0%, #f59e0b 100%)",
  "linear-gradient(135deg, #0369a1 0%, #38bdf8 100%)",
];

function pickGradient(label: string): string {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return BAND_GRADIENTS[h % BAND_GRADIENTS.length];
}

function fmtDeadline(iso: string | null): string {
  if (!iso) return "No deadline";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Risk pills ────────────────────────────────────────────────────────────────
function RiskPills({ healthy, moderate, highRisk, unanalyzed }: { healthy: number; moderate: number; highRisk: number; unanalyzed: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {highRisk > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-600 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />{highRisk} High Risk
        </span>
      )}
      {moderate > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />{moderate} Moderate
        </span>
      )}
      {healthy > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />{healthy} Healthy
        </span>
      )}
      {unanalyzed > 0 && (
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />{unanalyzed} Not analyzed
        </span>
      )}
    </div>
  );
}

// ── Create Assignment modal ───────────────────────────────────────────────────
function CreateAssignmentModal({
  classSectionId,
  token,
  onClose,
  onCreated,
}: {
  classSectionId: number;
  token: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle]           = useState("");
  const [deadline, setDeadline]     = useState("");
  const [maxGroupSize, setMaxSize]  = useState("5");
  const [sourceType, setSourceType] = useState<"GITHUB" | "EDITOR" | "COMBINED">("GITHUB");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !createdCode) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, createdCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        classSectionId,
        title: title.trim(),
        maxGroupSize: parseInt(maxGroupSize) || 5,
        sourceType,
      };
      if (deadline) body.deadline = new Date(deadline + "T00:00:00").toISOString();

      const res = await fetch("/api/assignments", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { joinCode: string };
        setCreatedCode(data.joinCode);
        onCreated();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to create project");
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!createdCode) return;
    await navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const SOURCE_OPTS = [
    { value: "GITHUB",   label: "GitHub" },
    { value: "EDITOR",   label: "FairTraze Docs" },
    { value: "COMBINED", label: "Combined (GitHub + Docs)" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !createdCode && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {createdCode ? "Project created" : "Create Project"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {createdCode ? "Share the join code with your class" : "Add a new project to this class section"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded" aria-label="Close">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state — show join code */}
        {createdCode ? (
          <div className="px-6 py-6 space-y-5">
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">"{title}" was created successfully.</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Join code
                <span className="ml-1 font-normal text-slate-400">— share this with your class</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 font-mono text-xl font-bold text-indigo-700 tracking-widest text-center select-all">
                  {createdCode}
                </div>
                <button
                  onClick={() => void handleCopy()}
                  title="Copy join code"
                  className={`shrink-0 p-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    copied
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                  }`}
                >
                  {copied ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Group leaders use this code to register their team and connect their repository.
              </p>
            </div>

            <div className="flex justify-end pt-1 border-t border-slate-100">
              <button onClick={onClose} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Creation form */
          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-xs text-red-700">{error}</div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Project title</label>
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Final Group Project"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Deadline <span className="font-normal text-slate-400">(optional)</span></label>
                  <input
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    type="date"
                    className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Max group size</label>
                  <input
                    value={maxGroupSize}
                    onChange={(e) => setMaxSize(e.target.value)}
                    type="number"
                    min="1"
                    max="20"
                    className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Analysis source</label>
                <div className="space-y-1.5">
                  {SOURCE_OPTS.map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-3 px-3.5 py-2 rounded-lg border cursor-pointer transition-colors ${
                      sourceType === opt.value ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="modal_sourceType"
                        checked={sourceType === opt.value}
                        onChange={() => setSourceType(opt.value)}
                        className="accent-indigo-500"
                      />
                      <span className={`text-sm font-medium ${sourceType === opt.value ? "text-indigo-700" : "text-slate-600"}`}>
                        {opt.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Join code placeholder */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Join code <span className="font-normal text-slate-400">(generated on create)</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-dashed border-slate-300 rounded-lg px-4 py-2.5 font-mono text-base font-bold text-slate-300 tracking-widest text-center">
                    FT-XXXX-XXXX
                  </div>
                  <div className="shrink-0 p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-300 cursor-not-allowed">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Share this with your class — group leaders use it to register their team and repo.</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !title.trim()}
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
                    Create Project
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────────
function ConfirmDialog({
  title, body, confirmLabel = "Delete", typeToConfirm, onConfirm, onCancel, busy, error,
}: {
  title: string; body: React.ReactNode; confirmLabel?: string; typeToConfirm?: string;
  onConfirm: () => void; onCancel: () => void; busy: boolean; error?: string | null;
}) {
  const [typedValue, setTypedValue] = useState("");
  const canConfirm = !typeToConfirm || typedValue === typeToConfirm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onCancel}>
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
          {error && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 flex justify-end gap-2 border-t border-slate-100 mt-4">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={busy || !canConfirm} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold transition-colors">
            {busy ? <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />Deleting…</span> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page component ────────────────────────────────────────────────────────────
interface Props { classId: number }

export function ClassPage({ classId }: Props) {
  const { navigate } = useRouter();
  const { token }    = useAuth();

  const [classInfo, setClassInfo]           = useState<ClassInfo | null>(null);
  const [assignments, setAssignments]       = useState<LifecycleAssignment[]>([]);
  const [assignGroups, setAssignGroups]     = useState<Record<number, AssignmentGroup[]>>({});
  const [summary, setSummary]               = useState<ProjectSummaryItem[]>([]);
  const [loading, setLoading]               = useState(true);
  const [loadError, setLoadError]           = useState<string | null>(null);
  const [showModal, setShowModal]           = useState(false);
  const [filterAtRisk, setFilterAtRisk]     = useState(false);
  const [deleteTarget, setDeleteTarget]     = useState<LifecycleAssignment | null>(null);
  const [deleting, setDeleting]             = useState(false);
  const [deleteError, setDeleteError]       = useState<string | null>(null);
  const [copiedId, setCopiedId]             = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [classRes, summaryRes] = await Promise.all([
        fetch(`/api/classes/${classId}/assignments`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/projects/summary"),
      ]);
      if (!classRes.ok) {
        setLoadError(classRes.status === 403 ? "You do not have access to this class section." : "Class section not found.");
        return;
      }
      const classData   = (await classRes.json()) as { class: ClassInfo; assignments: LifecycleAssignment[] };
      const summaryData = (await summaryRes.json()) as { summary: ProjectSummaryItem[] };

      setClassInfo(classData.class);
      setAssignments(classData.assignments);
      setSummary(summaryData.summary);

      // Parallel-fetch each assignment's groups for risk roll-up
      const details = await Promise.all(
        classData.assignments.map((a) =>
          fetch(`/api/assignments/${a.id}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.ok ? r.json() : Promise.resolve({ groups: [] }))
            .then((d: { groups?: AssignmentGroup[] }) => ({ id: a.id, groups: d.groups ?? [] }))
        )
      );
      const byId: Record<number, AssignmentGroup[]> = {};
      for (const d of details) byId[d.id] = d.groups;
      setAssignGroups(byId);
      setLoadError(null);
    } catch {
      setLoadError("Could not load class data — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [classId, token]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleDeleteProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/assignments/${deleteTarget.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeleteTarget(null);
        await fetchData();
      } else {
        const data = (await res.json()) as { error?: string };
        setDeleteError(data.error ?? "Failed to delete project");
      }
    } catch {
      setDeleteError("Network error — is the server running?");
    } finally {
      setDeleting(false);
    }
  }

  async function handleCopyCode(id: number, code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function getAssignmentItems(assignmentId: number): ProjectSummaryItem[] {
    const groups = assignGroups[assignmentId] ?? [];
    const ids    = new Set(groups.map((g) => g.id));
    return summary.filter((i) => ids.has(i.projectId));
  }

  const totalAtRisk = assignments.reduce((sum, a) => sum + classAtRiskCount(getAssignmentItems(a.id)), 0);

  const visibleAssignments = filterAtRisk
    ? assignments.filter((a) => classAtRiskCount(getAssignmentItems(a.id)) > 0)
    : assignments;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {showModal && classInfo && (
        <CreateAssignmentModal
          classSectionId={classInfo.id}
          token={token}
          onClose={() => setShowModal(false)}
          onCreated={() => void fetchData()}
        />
      )}
      {deleteTarget && (() => {
        const nGroups = deleteTarget._count.projects;
        return (
          <ConfirmDialog
            title={`Delete "${deleteTarget.title}"?`}
            body={
              <>
                {nGroups > 0 && (
                  <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 font-semibold text-red-700">
                    This will permanently delete {nGroups} group{nGroups !== 1 ? "s" : ""} and all their stored reports.
                  </div>
                )}
                This will permanently remove the project and all its groups, members, and reports. This cannot be undone.
              </>
            }
            confirmLabel="Delete project"
            typeToConfirm={deleteTarget.title}
            onConfirm={() => void handleDeleteProject()}
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
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <button onClick={() => navigate("/dashboard")} className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium">
                Dashboard
              </button>
              <span className="text-slate-300 text-xs shrink-0">›</span>
              {classInfo ? (
                <>
                  <span className="shrink-0 text-xs font-mono font-bold text-indigo-600">
                    {classInfo.subjectCode}
                    {classInfo.edpCode && (
                      <span className="font-semibold text-indigo-400"> · EDP {classInfo.edpCode}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-800">{classInfo.subjectName}</span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 tracking-wide uppercase shrink-0">
                    {classInfo.course}
                  </span>
                  {classInfo.type && (
                    <span className="shrink-0 text-[10px] text-slate-400 font-mono">
                      {classInfo.type.charAt(0) + classInfo.type.slice(1).toLowerCase()}
                    </span>
                  )}
                </>
              ) : (
                <span className="shrink-0 text-xs text-slate-400">Loading…</span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {assignments.reduce((s, a) => s + a._count.projects, 0)} group{assignments.reduce((s, a) => s + a._count.projects, 0) !== 1 ? "s" : ""} · {assignments.length} project{assignments.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            {totalAtRisk > 0 && (
              <button
                onClick={() => setFilterAtRisk(!filterAtRisk)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
                  filterAtRisk ? "bg-red-100 border-red-300 text-red-800" : "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {totalAtRisk} group{totalAtRisk !== 1 ? "s" : ""} need attention
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8">

        {loading && (
          <div className="flex items-center gap-3 py-16 text-slate-400 text-sm justify-center">
            <span className="h-4 w-4 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
            Loading projects…
          </div>
        )}

        {loadError && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{loadError}</div>
        )}

        {!loading && !loadError && (
          <>
            {visibleAssignments.length === 0 && assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">No projects yet</p>
                  <p className="text-xs text-slate-400 mt-1">Create your first project for this class section.</p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create first project
                </button>
              </div>
            ) : visibleAssignments.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                No projects with at-risk groups.{" "}
                <button onClick={() => setFilterAtRisk(false)} className="underline hover:text-slate-600">Show all</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visibleAssignments.map((a) => {
                  const items      = getAssignmentItems(a.id);
                  const atRisk     = classAtRiskCount(items);
                  const healthy    = items.filter((i) => i.isAnalyzed && i.teamHealth === "Healthy").length;
                  const moderate   = items.filter((i) => i.isAnalyzed && i.teamHealth === "Moderate Risk").length;
                  const highRisk   = items.filter((i) => i.isAnalyzed && i.teamHealth === "High Risk").length;
                  const unanalyzed = items.filter((i) => !i.isAnalyzed).length;

                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/class/${classId}/assignment/${a.id}`)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/class/${classId}/assignment/${a.id}`); }}
                      className="group cursor-pointer w-full text-left bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      {/* Colored band */}
                      <div className="relative px-5 pt-5 pb-4 flex flex-col gap-3" style={{ background: pickGradient(a.title) }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className="text-[10px] font-bold text-white/90 bg-white/20 border border-white/30 rounded px-1.5 py-0.5 uppercase tracking-wide">
                              {a.sourceType}
                            </span>
                            {atRisk > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/25 border border-white/30 text-white text-[11px] font-semibold whitespace-nowrap">
                                ⚠ {atRisk} at risk
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(a); setDeleteError(null); }}
                              title="Delete project"
                              className="p-1 rounded text-white/50 hover:text-white hover:bg-white/20 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-white font-semibold text-sm leading-snug">{a.title}</p>
                      </div>

                      {/* Card body */}
                      <div className="px-5 py-4 flex flex-col gap-3">
                        <p className="text-xs text-slate-500">
                          Deadline: <span className="font-medium text-slate-700">{fmtDeadline(a.deadline)}</span>
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-slate-500">
                            {a._count.projects} group{a._count.projects !== 1 ? "s" : ""}
                          </p>
                          {/* Copyable join code */}
                          <div className="relative group/copy flex items-center gap-1">
                            <span className="font-mono text-[11px] text-slate-400 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 tracking-wider">
                              {a.joinCode}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleCopyCode(a.id, a.joinCode); }}
                              title={copiedId === a.id ? "Copied!" : "Copy join code"}
                              className={`p-1 rounded transition-colors ${copiedId === a.id ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}
                            >
                              {copiedId === a.id ? (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            <span className={`absolute -top-7 right-0 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-white whitespace-nowrap pointer-events-none transition-opacity ${copiedId === a.id ? "opacity-100" : "opacity-0 group-hover/copy:opacity-100"}`}>
                              {copiedId === a.id ? "Copied!" : "Copy"}
                            </span>
                          </div>
                        </div>
                        <RiskPills healthy={healthy} moderate={moderate} highRisk={highRisk} unanalyzed={unanalyzed} />
                        <div className="flex justify-end pt-1">
                          <span className="text-xs text-slate-400 group-hover:text-indigo-500 transition-colors">View groups →</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
