import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

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

// ── Sample data for institution overview (not live) ───────────────────────────
const INSTITUTION_COUNTS = [
  { label: "School",      value: 1,  color: "text-amber-600  bg-amber-50  border-amber-200"  },
  { label: "Departments", value: 3,  color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  { label: "Instructors", value: 12, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "Classes",     value: 18, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "Groups",      value: 47, color: "text-slate-700  bg-slate-50  border-slate-200"  },
  { label: "At-Risk",     value: 7,  color: "text-red-600    bg-red-50    border-red-200"    },
];

const AT_RISK_GROUPS = [
  { group: "Group 3", code: "IT-ELEC 2",    health: "High Risk",     gini: 0.54, flags: 3 },
  { group: "Group 1", code: "CC-APPSDEV22", health: "Moderate Risk", gini: 0.31, flags: 1 },
  { group: "Group 7", code: "CS-SE301",     health: "Moderate Risk", gini: 0.27, flags: 2 },
  { group: "Group 4", code: "IT-IMDBSYS32", health: "Moderate Risk", gini: 0.23, flags: 1 },
];

const GINI_BINS = [
  { range: "0.0–0.1", count: 8,  health: "healthy"  },
  { range: "0.1–0.2", count: 14, health: "healthy"  },
  { range: "0.2–0.3", count: 11, health: "moderate" },
  { range: "0.3–0.4", count: 7,  health: "moderate" },
  { range: "0.4–0.5", count: 5,  health: "high"     },
  { range: "0.5–0.6", count: 2,  health: "high"     },
];

const MAX_BIN = Math.max(...GINI_BINS.map((b) => b.count));

const HEALTH_BADGE: Record<string, string> = {
  "High Risk":     "text-red-700   bg-red-50   border-red-200",
  "Moderate Risk": "text-amber-700 bg-amber-50 border-amber-200",
};

const BIN_COLOR: Record<string, string> = {
  healthy:  "bg-emerald-400",
  moderate: "bg-amber-400",
  high:     "bg-red-400",
};

// ── Small reusable pieces ─────────────────────────────────────────────────────
function SampleChip() {
  return (
    <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 normal-case tracking-normal align-middle">
      Sample data
    </span>
  );
}

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
  const [allUsers,    setAllUsers]    = useState<UserRecord[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError,  setUsersError]  = useState("");
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [toast,       setToast]       = useState<{ type: "success" | "error"; msg: string } | null>(null);
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
    fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as { users?: UserRecord[]; error?: string };
        if (!r.ok) { setUsersError(json.error ?? "Could not load users."); return; }
        setAllUsers(json.users ?? []);
      })
      .catch(() => setUsersError("Network error — could not load users."))
      .finally(() => setUsersLoading(false));
  }, [token]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Client-side filtering — all users are fetched once; search/role filter is local.
  const displayedUsers = allUsers.filter((u) => {
    if (roleFilter && u.systemRole !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
      setAllUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, systemRole: json.systemRole } : x));
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
      setAllUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, active: json.active } : x));
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
      setAllUsers((prev) => prev.filter((x) => x.id !== u.id));
      showToast("success", json.message ?? `${u.name} deleted.`);
    } catch {
      showToast("error", "Network error.");
    }
  }

  const selfId = user?.id ?? -1;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 space-y-8">

        {/* Page heading */}
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Admin Panel</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            User management and institution overview.
          </p>
        </div>

        {/* ── User Management ──────────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">

          {/* Section header + controls */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">User Management</h2>
              {!usersLoading && !usersError && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {allUsers.length} total · {allUsers.filter((u) => u.active).length} active
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="search"
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 w-52"
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
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
          )}
        </section>

        {/* ── Institution Overview (sample data) ───────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
            Institution Summary <SampleChip />
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {INSTITUTION_COUNTS.map(({ label, value, color }) => (
              <div
                key={label}
                className={`bg-white border rounded-xl p-4 text-center ${
                  color.split(" ").filter((c) => c.startsWith("border")).join(" ")
                }`}
              >
                <p className={`text-2xl font-bold ${color.split(" ")[0]}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Gini Distribution ────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
              Fairness Distribution (Gini) <SampleChip />
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Distribution of team Gini coefficients across all 47 groups
            </p>
            <div className="flex items-end gap-2 h-32">
              {GINI_BINS.map((bin) => (
                <div key={bin.range} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500 font-medium">{bin.count}</span>
                  <div
                    className={`w-full rounded-t-sm ${BIN_COLOR[bin.health]} opacity-80`}
                    style={{ height: `${(bin.count / MAX_BIN) * 100}%` }}
                  />
                  <span className="text-[9px] text-slate-400 leading-tight text-center">{bin.range}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
              {[
                { color: "bg-emerald-400", label: "Healthy (< 0.2)" },
                { color: "bg-amber-400",   label: "Moderate (0.2–0.4)" },
                { color: "bg-red-400",     label: "High Risk (≥ 0.4)" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className={`w-2.5 h-2.5 rounded-sm ${color} opacity-80`} />
                  {label}
                </div>
              ))}
            </div>
          </section>

          {/* ── At-Risk Groups ───────────────────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
              At-Risk Groups <SampleChip />
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Groups with High or Moderate Risk team health across all classes
            </p>
            <div className="space-y-2">
              {AT_RISK_GROUPS.map((g) => (
                <div
                  key={`${g.group}-${g.code}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-800">{g.group}</span>
                      <span className="text-[10px] font-mono text-indigo-600">{g.code}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${HEALTH_BADGE[g.health]}`}>
                        {g.health}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Gini {g.gini.toFixed(2)} · {g.flags} flag{g.flags !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled
                    className="shrink-0 text-[11px] text-slate-300 cursor-not-allowed font-medium"
                    title="Coming soon"
                  >
                    View →
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-4">Showing 4 of 7 at-risk groups</p>
          </section>
        </div>

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
