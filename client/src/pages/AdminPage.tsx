import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { PaginationBar } from "../components/PaginationBar";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRecord {
  id:             number;
  name:           string;
  email:          string;
  systemRole:     "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername: string | null;
  active:         boolean;
  createdAt:      string;
}

interface AtRiskGroup {
  projectId:      number;
  groupName:      string;
  classDisplay:   string;
  subjectName:    string;
  instructorName: string;
  teamHealth:     string;
  gini:           number | null;
  analyzedAt:     string;
}

interface ClassSectionItem {
  id:          number;
  subjectCode: string;
  subjectName: string;
  edpCode:     string;
  course:      string;
  type:        string;
  createdAt:   string;
  instructor:  { id: number; name: string; email: string };
  assignments: Array<{ id: number; title: string; _count: { projects: number } }>;
}

interface OverviewData {
  users:              { total: number; admins: number; instructors: number; students: number };
  classSections:      number;
  totalProjects:      number;
  totalGroups:        number;
  analyzedGroups:     number;
  healthDistribution: { healthy: number; moderateRisk: number; highRisk: number };
  flagTotals:         { inactive: number; freeRider: number; overload: number; deadlineDriven: number };
  atRiskGroups:       AtRiskGroup[];
  openDisputesCount:  number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLE_BADGE: Record<string, string> = {
  ADMIN:      "text-violet-700 bg-violet-50 border-violet-200",
  INSTRUCTOR: "text-indigo-700 bg-indigo-50 border-indigo-200",
  STUDENT:    "text-slate-600  bg-slate-50  border-slate-200",
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN:      "Admin",
  INSTRUCTOR: "Instructor",
  STUDENT:    "Student",
};

const HEALTH_BADGE: Record<string, string> = {
  "Healthy":       "text-emerald-700 bg-emerald-50 border-emerald-200",
  "High Risk":     "text-red-700     bg-red-50     border-red-200",
  "Moderate Risk": "text-amber-700   bg-amber-50   border-amber-200",
};

const HEALTH_BAR: Array<{ key: keyof OverviewData["healthDistribution"]; label: string; cls: string }> = [
  { key: "healthy",      label: "Healthy",       cls: "bg-emerald-400" },
  { key: "moderateRisk", label: "Moderate Risk",  cls: "bg-amber-400"  },
  { key: "highRisk",     label: "High Risk",      cls: "bg-red-400"    },
];

// ── Small reusable pieces ─────────────────────────────────────────────────────
function DisabledBtn({ children }: { children: React.ReactNode }) {
  return (
    <button
      disabled
      title="Coming soon"
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed border border-slate-200"
    >
      {children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AdminPage() {
  const { user, token }  = useAuth();
  const { navigate }     = useRouter();

  // ── User management state ──────────────────────────────────────────────────
  const [displayedUsers, setDisplayedUsers] = useState<UserRecord[]>([]);
  const [usersLoading,   setUsersLoading]   = useState(true);
  const [usersError,     setUsersError]     = useState("");
  const [search,         setSearch]         = useState("");
  const [roleFilter,     setRoleFilter]     = useState("");
  const [usersPage,      setUsersPage]      = useState(1);
  const [usersMeta,      setUsersMeta]      = useState({ total: 0, totalPages: 1, pageSize: 20 });
  const [toast,          setToast]          = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, msg });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const loadUsers = useCallback(() => {
    if (!token) return;
    setUsersLoading(true);
    setUsersError("");
    const params = new URLSearchParams({ page: String(usersPage), pageSize: "20" });
    if (search)     params.set("search", search);
    if (roleFilter) params.set("role",   roleFilter);
    fetch(`/api/admin/users?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as { users?: UserRecord[]; total?: number; totalPages?: number; pageSize?: number; error?: string };
        if (!r.ok) { setUsersError(json.error ?? "Could not load users."); return; }
        setDisplayedUsers(json.users ?? []);
        setUsersMeta({ total: json.total ?? 0, totalPages: json.totalPages ?? 1, pageSize: json.pageSize ?? 20 });
      })
      .catch(() => setUsersError("Network error — could not load users."))
      .finally(() => setUsersLoading(false));
  }, [token, search, roleFilter, usersPage]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function changeRole(u: UserRecord, newRole: string) {
    if (newRole === u.systemRole) return;
    if (!window.confirm(`Change ${u.name}'s role from ${ROLE_LABEL[u.systemRole]} to ${ROLE_LABEL[newRole]}?`)) return;
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/role`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ role: newRole }),
      });
      const json = await res.json() as UserRecord & { error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not change role."); return; }
      setDisplayedUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, systemRole: json.systemRole } : x));
      showToast("success", `${u.name} is now ${ROLE_LABEL[json.systemRole]}.`);
    } catch {
      showToast("error", "Network error.");
    }
  }

  async function toggleStatus(u: UserRecord) {
    const action = u.active ? "deactivate" : "activate";
    if (!window.confirm(`${u.active ? "Deactivate" : "Activate"} ${u.name}?\n\n${u.active ? "They will not be able to log in until reactivated." : "They will be able to log in again."}`)) return;
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ active: !u.active }),
      });
      const json = await res.json() as UserRecord & { error?: string };
      if (!res.ok) { showToast("error", json.error ?? `Could not ${action} user.`); return; }
      setDisplayedUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, active: json.active } : x));
      showToast("success", `${u.name} ${json.active ? "activated" : "deactivated"}.`);
    } catch {
      showToast("error", "Network error.");
    }
  }

  async function deleteUser(u: UserRecord) {
    if (!window.confirm(
      `Permanently delete ${u.name} (${u.email})?\n\nThis will remove all their data — classes, groups, disputes, and alerts. This cannot be undone.`
    )) return;
    try {
      const res  = await fetch(`/api/admin/users/${u.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not delete user."); return; }
      showToast("success", json.message ?? `${u.name} deleted.`);
      loadUsers();
    } catch {
      showToast("error", "Network error.");
    }
  }

  // ── Institution overview state ─────────────────────────────────────────────
  const [overview,        setOverview]        = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError,   setOverviewError]   = useState("");

  const loadOverview = useCallback(() => {
    if (!token) return;
    setOverviewLoading(true);
    setOverviewError("");
    fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as OverviewData & { error?: string };
        if (!r.ok) { setOverviewError(json.error ?? "Could not load overview."); return; }
        setOverview(json);
      })
      .catch(() => setOverviewError("Network error — could not load overview."))
      .finally(() => setOverviewLoading(false));
  }, [token]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  // ── Browse Classes state ───────────────────────────────────────────────────
  const [classes,        setClasses]        = useState<ClassSectionItem[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError,   setClassesError]   = useState("");

  const loadClasses = useCallback(() => {
    if (!token) return;
    setClassesLoading(true);
    setClassesError("");
    fetch("/api/admin/classes", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as { classes?: ClassSectionItem[]; error?: string };
        if (!r.ok) { setClassesError(json.error ?? "Could not load classes."); return; }
        setClasses(json.classes ?? []);
      })
      .catch(() => setClassesError("Network error — could not load classes."))
      .finally(() => setClassesLoading(false));
  }, [token]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const [atRiskPage, setAtRiskPage] = useState(1);
  const AT_RISK_PAGE_SIZE = 8;

  const selfId = user?.id ?? -1;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 space-y-8">

        {/* Page heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Admin Panel</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              User management and institution overview.
            </p>
          </div>
          <button
            onClick={() => navigate("/admin/audit")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Audit Log
          </button>
        </div>

        {/* ── User Management ──────────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">

          {/* Section header + controls */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">User Management</h2>
              {!usersLoading && !usersError && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {usersMeta.total} total
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="search"
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setUsersPage(1); }}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 w-52"
              />
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setUsersPage(1); }}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Admin</option>
                <option value="INSTRUCTOR">Instructor</option>
                <option value="STUDENT">Student</option>
              </select>
              <button
                onClick={loadUsers}
                className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Toast feedback */}
          {toast && (
            <div className={`px-6 py-2.5 text-xs font-medium border-b flex items-center gap-2 ${
              toast.type === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200"
            }`}>
              {toast.type === "success"
                ? <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                : <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              }
              {toast.msg}
            </div>
          )}

          {/* Loading */}
          {usersLoading && (
            <div className="flex items-center justify-center gap-2 py-14 text-slate-400 text-sm">
              <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
              Loading…
            </div>
          )}

          {/* Error */}
          {!usersLoading && usersError && (
            <div className="px-6 py-14 text-center space-y-2">
              <p className="text-sm text-red-600">{usersError}</p>
              <button onClick={loadUsers} className="text-xs text-indigo-600 hover:underline">Retry</button>
            </div>
          )}

          {/* Empty */}
          {!usersLoading && !usersError && displayedUsers.length === 0 && (
            <p className="px-6 py-14 text-center text-sm text-slate-400">No users match your filters.</p>
          )}

          {/* Table */}
          {!usersLoading && !usersError && displayedUsers.length > 0 && (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Name / Email</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Role</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden sm:table-cell">GitHub</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden md:table-cell">Joined</th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayedUsers.map((u) => {
                    const isSelf = u.id === selfId;
                    return (
                      <tr key={u.id} className={`text-sm transition-colors hover:bg-slate-50/60 ${!u.active ? "opacity-50" : ""}`}>

                        {/* Name / Email */}
                        <td className="px-5 py-3.5 min-w-[180px]">
                          <p className="font-medium text-slate-800 leading-tight">{u.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                          {isSelf && (
                            <span className="text-[10px] text-indigo-500 font-semibold">you</span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-5 py-3.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${ROLE_BADGE[u.systemRole]}`}>
                            {u.systemRole}
                          </span>
                        </td>

                        {/* GitHub */}
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          {u.githubUsername
                            ? <span className="text-xs font-mono text-slate-600">{u.githubUsername}</span>
                            : <span className="text-xs text-slate-300">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            u.active
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                              : "text-slate-500 bg-slate-100 border-slate-200"
                          }`}>
                            {u.active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* Joined */}
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <span className="text-xs text-slate-400">
                            {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          {isSelf ? (
                            <span className="text-xs text-slate-300 block text-right">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Role select */}
                              <select
                                value={u.systemRole}
                                onChange={(e) => { void changeRole(u, e.target.value); }}
                                className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer"
                                title="Change role"
                              >
                                <option value="ADMIN">Admin</option>
                                <option value="INSTRUCTOR">Instructor</option>
                                <option value="STUDENT">Student</option>
                              </select>

                              {/* Activate / Deactivate */}
                              <button
                                onClick={() => { void toggleStatus(u); }}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                                  u.active
                                    ? "border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600 hover:bg-red-50"
                                    : "border-slate-200 text-slate-500 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50"
                                }`}
                                title={u.active ? "Deactivate account" : "Activate account"}
                              >
                                {u.active ? "Deactivate" : "Activate"}
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => { void deleteUser(u); }}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete user permanently"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 pb-4">
              <PaginationBar
                page={usersPage}
                totalPages={usersMeta.totalPages}
                total={usersMeta.total}
                pageSize={usersMeta.pageSize}
                onPage={setUsersPage}
                label="users"
              />
            </div>
            </>
          )}
        </section>

        {/* ── Institution Overview ──────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
              Institution Overview
            </h2>
            <button
              onClick={loadOverview}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* Stat cards */}
          {overviewLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 text-center animate-pulse">
                  <div className="h-7 bg-slate-100 rounded mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
                </div>
              ))}
            </div>
          )}

          {!overviewLoading && overviewError && (
            <div className="bg-white border border-red-200 rounded-xl p-6 text-center">
              <p className="text-sm text-red-600 mb-2">{overviewError}</p>
              <button onClick={loadOverview} className="text-xs text-indigo-600 hover:underline">Retry</button>
            </div>
          )}

          {!overviewLoading && !overviewError && overview && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Instructors", value: overview.users.instructors, textCls: "text-indigo-600", borderCls: "border-indigo-200" },
                  { label: "Students",    value: overview.users.students,    textCls: "text-slate-700",  borderCls: "border-slate-200"  },
                  { label: "Classes",     value: overview.classSections,     textCls: "text-slate-700",  borderCls: "border-slate-200"  },
                  { label: "Projects",    value: overview.totalProjects,     textCls: "text-slate-700",  borderCls: "border-slate-200"  },
                  { label: "Groups",      value: overview.totalGroups,       textCls: "text-slate-700",  borderCls: "border-slate-200"  },
                  { label: "Analyzed",    value: overview.analyzedGroups,    textCls: "text-emerald-600", borderCls: "border-emerald-200" },
                ].map(({ label, value, textCls, borderCls }) => (
                  <div key={label} className={`bg-white border ${borderCls} rounded-xl p-4 text-center`}>
                    <p className={`text-2xl font-bold ${textCls}`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {overview.openDisputesCount > 0 && (
                <p className="text-xs text-amber-600 mt-3 px-1">
                  {overview.openDisputesCount} open dispute{overview.openDisputesCount !== 1 ? "s" : ""} institution-wide
                </p>
              )}
            </>
          )}
        </section>

        {/* ── Health Distribution + At-Risk Groups ─────────────────────────────── */}
        {!overviewLoading && !overviewError && overview && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Team Health Distribution */}
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                Team Health Distribution
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                {overview.analyzedGroups > 0
                  ? `Across ${overview.analyzedGroups} analyzed group${overview.analyzedGroups !== 1 ? "s" : ""}`
                  : "No groups analyzed yet"}
              </p>

              {overview.analyzedGroups === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  No groups analyzed yet. Run an analysis to see health data.
                </p>
              ) : (
                <>
                  <div className="space-y-3">
                    {HEALTH_BAR.map(({ key, label, cls }) => {
                      const count = overview.healthDistribution[key];
                      const pct   = (count / overview.analyzedGroups) * 100;
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-24 text-right shrink-0">{label}</span>
                          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${cls} opacity-80 rounded-full transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 w-6 text-right shrink-0">{count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Flag totals */}
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400 mb-2">Flag totals across all latest reports</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Free Rider",      count: overview.flagTotals.freeRider,     cls: "text-orange-700 bg-orange-50 border-orange-200" },
                        { label: "Overload",        count: overview.flagTotals.overload,      cls: "text-red-700    bg-red-50    border-red-200"    },
                        { label: "Inactive",        count: overview.flagTotals.inactive,      cls: "text-slate-600  bg-slate-50  border-slate-200"  },
                        { label: "Deadline-Driven", count: overview.flagTotals.deadlineDriven, cls: "text-blue-700  bg-blue-50   border-blue-200"   },
                      ].map(({ label, count, cls }) => (
                        <span key={label} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cls}`}>
                          {count} {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* At-Risk Groups */}
            <section className="bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
                At-Risk Groups
              </h2>
              <p className="text-xs text-slate-400 mb-5">
                Moderate/High Risk or flagged members — newest analyzed first
              </p>

              {overview.atRiskGroups.length === 0 ? (
                <p className="text-sm text-slate-400 py-6 text-center">
                  No at-risk groups detected across the institution.
                </p>
              ) : (() => {
                const totalAtRisk = overview.atRiskGroups.length;
                const atRiskTotalPages = Math.max(1, Math.ceil(totalAtRisk / AT_RISK_PAGE_SIZE));
                const pagedGroups = overview.atRiskGroups.slice(
                  (atRiskPage - 1) * AT_RISK_PAGE_SIZE,
                  atRiskPage * AT_RISK_PAGE_SIZE
                );
                return (
                  <>
                    <div className="space-y-2">
                      {pagedGroups.map((g) => (
                        <div
                          key={g.projectId}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-800">{g.groupName}</span>
                              {g.classDisplay && (
                                <span className="text-[10px] font-mono text-indigo-600">{g.classDisplay}</span>
                              )}
                              {g.instructorName && g.instructorName !== "Unknown" && (
                                <span className="text-[10px] text-slate-400">{g.instructorName}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HEALTH_BADGE[g.teamHealth] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                                {g.teamHealth}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                Gini {g.gini != null ? g.gini.toFixed(2) : "—"}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/project/${g.projectId}`)}
                            className="shrink-0 text-[11px] text-indigo-500 hover:text-indigo-700 font-medium transition-colors"
                          >
                            View →
                          </button>
                        </div>
                      ))}
                    </div>
                    <PaginationBar
                      page={atRiskPage}
                      totalPages={atRiskTotalPages}
                      total={totalAtRisk}
                      pageSize={AT_RISK_PAGE_SIZE}
                      onPage={setAtRiskPage}
                      label="groups"
                    />
                  </>
                );
              })()}
            </section>
          </div>
        )}

        {/* ── Browse Classes ───────────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Browse Classes</h2>
              {!classesLoading && !classesError && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {classes.length} class section{classes.length !== 1 ? "s" : ""} across all instructors
                </p>
              )}
            </div>
            <button onClick={loadClasses} className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors">
              Refresh
            </button>
          </div>

          {classesLoading && (
            <div className="flex items-center justify-center gap-2 py-14 text-slate-400 text-sm">
              <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
              Loading…
            </div>
          )}

          {!classesLoading && classesError && (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-red-600 mb-2">{classesError}</p>
              <button onClick={loadClasses} className="text-xs text-indigo-600 hover:underline">Retry</button>
            </div>
          )}

          {!classesLoading && !classesError && classes.length === 0 && (
            <p className="px-6 py-14 text-center text-sm text-slate-400">No class sections found.</p>
          )}

          {!classesLoading && !classesError && classes.length > 0 && (
            <div className="divide-y divide-slate-50">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/class/${cls.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(`/class/${cls.id}`); }}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-indigo-600">{cls.subjectCode}</span>
                      {cls.edpCode && (
                        <span className="text-[10px] text-indigo-400 font-mono">EDP {cls.edpCode}</span>
                      )}
                      <span className="text-xs font-semibold text-slate-800">{cls.subjectName}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 uppercase tracking-wide">{cls.course}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{cls.type.charAt(0) + cls.type.slice(1).toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-slate-400">{cls.instructor.name}</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="text-xs text-slate-400">
                        {cls.assignments.length} assignment{cls.assignments.length !== 1 ? "s" : ""}
                        {" · "}
                        {cls.assignments.reduce((s, a) => s + a._count.projects, 0)} group{cls.assignments.reduce((s, a) => s + a._count.projects, 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-indigo-500 font-medium">View →</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Hierarchy Management ─────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Hierarchy Management
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            Create and manage institutions, departments, and instructors. Coming soon.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Departments</p>
              <p className="text-xs text-slate-400 mb-3">Create or rename departments within the institution.</p>
              <DisabledBtn>Create Department</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Instructors</p>
              <p className="text-xs text-slate-400 mb-3">Invite instructors and assign them to departments.</p>
              <DisabledBtn>Invite Instructor</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Classes</p>
              <p className="text-xs text-slate-400 mb-3">View and manage all class sections across departments.</p>
              <DisabledBtn>Manage Classes</DisabledBtn>
            </div>
            <div className="border border-dashed border-slate-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-slate-600 mb-1">Reports</p>
              <p className="text-xs text-slate-400 mb-3">Export aggregated fairness data across the institution.</p>
              <DisabledBtn>Export Reports</DisabledBtn>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-4">
            All management actions are disabled in this preview.
          </p>
        </section>

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
