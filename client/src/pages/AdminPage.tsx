import { AppFooter } from "../components/AppFooter";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { PaginationBar } from "../components/PaginationBar";
import { InstructorApprovals } from "../components/InstructorApprovals";
import { DeletionRequests } from "../components/DeletionRequests";
import { OverflowMenu } from "../components/ui/OverflowMenu";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { parseAdminUsersView, serializeAdminUsersView, defaultDir } from "../lib/adminUsersUrl";
import type { AdminUsersView, UserSort } from "../lib/adminUsersUrl";
import {
  adminUsersKey,
  useAdminUsersQuery,
  useAdminOverviewQuery,
  useAdminDepartmentsQuery,
} from "../hooks/useAdminQueries";
import type { AdminUsersParams } from "../hooks/useAdminQueries";

// ── Types ─────────────────────────────────────────────────────────────────────
interface UserRecord {
  id:             number;
  name:           string;
  email:          string;
  systemRole:     "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername: string | null;
  active:         boolean;
  lockedUntil:    string | null;
  createdAt:      string;
  lastLoginAt?:   string | null;
  deletedAt?:     string | null;
}

interface DepartmentItem {
  id:        number;
  name:      string;
  code:      string;
  createdAt: string;
  _count:    { classSections: number };
}

// ── Constants ─────────────────────────────────────────────────────────────────
/** How long the Undo button stays after a deactivation. */
const UNDO_WINDOW_MS = 10_000;

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

/** Column header that sorts the list: aria-sort on the th, a real button inside so it works from the keyboard. */
function SortHeader({ label, sort, view, onSort, className = "" }: {
  label: string; sort: UserSort; view: AdminUsersView; onSort: (s: UserSort) => void; className?: string;
}) {
  const active = view.sort === sort;
  const ariaSort = active ? (view.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th aria-sort={ariaSort} className={`px-5 py-1 text-left text-xs font-semibold text-slate-600 uppercase tracking-widest ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sort)}
        className="inline-flex min-h-8 items-center gap-1 rounded uppercase tracking-widest hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {label}
        <span aria-hidden="true">{active ? (view.dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function AdminPage() {
  const { user, token }  = useAuth();
  const { navigate }     = useRouter();

  // ── User management state ──────────────────────────────────────────────────
  // Filters, sort and page live in the URL (lib/adminUsersUrl.ts) so reload and the back button keep the view.
  const [view,           setView]           = useState<AdminUsersView>(() => parseAdminUsersView(window.location.search));
  const [searchInput,    setSearchInput]    = useState(view.q);
  const searchRef = useRef<HTMLInputElement>(null);
  const updateView = (patch: Partial<AdminUsersView>) => setView((v) => ({ ...v, page: 1, ...patch }));
  const toastApi = useToast();
  const selfId = user?.id ?? -1;

  // Debounce the search box; the query only sees the settled value, and the
  // page resets to 1 only when that settled value actually changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setView((v) => (v.q === searchInput ? v : { ...v, q: searchInput, page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const next = serializeAdminUsersView(view, window.location.search);
    if (next !== window.location.search) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [view]);

  // "/" jumps to the search box, unless the person is already typing or a dialog is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    toastApi.showToast({ message: msg, tone: type });
  }

  const queryClient = useQueryClient();
  const usersQueryParams: AdminUsersParams = {
    page: view.page, search: view.q, roleFilter: view.role, status: view.status,
    lastActive: view.lastActive, sort: view.sort, dir: view.dir, includeFormer: view.former,
  };
  const usersQuery = useAdminUsersQuery(token, usersQueryParams);
  const displayedUsers = usersQuery.data?.users ?? [];
  const usersMeta = {
    total:      usersQuery.data?.total ?? 0,
    formerCount: usersQuery.data?.formerCount ?? 0,
    totalPages: usersQuery.data?.totalPages ?? 1,
    pageSize:   usersQuery.data?.pageSize ?? 10,
  };
  const usersLoading = usersQuery.isLoading;
  const usersError = usersQuery.isError
    ? (usersQuery.error instanceof Error ? usersQuery.error.message : "Could not load users.")
    : "";
  const usersQueryKey = adminUsersKey(usersQueryParams);

  function loadUsers() {
    void usersQuery.refetch();
  }

  const [roleChange, setRoleChange] = useState<{ user: UserRecord; newRole: string } | null>(null);

  /** Asks first (ConfirmDialog below); the change itself runs in performRoleChange. */
  function changeRole(u: UserRecord, newRole: string) {
    if (newRole === u.systemRole) return;
    if (u.id === selfId) { showToast("error", "You cannot change your own role. Ask another admin to do it."); return; }
    setRoleChange({ user: u, newRole });
  }

  async function performRoleChange(u: UserRecord, newRole: string) {
    setRoleChange(null);
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/role`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ role: newRole }),
      });
      const json = await res.json() as UserRecord & { error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not change role."); return; }
      queryClient.setQueryData(usersQueryKey, (old: typeof usersQuery.data) => old && {
        ...old, users: old.users.map((x) => x.id === u.id ? { ...x, systemRole: json.systemRole } : x),
      });
      showToast("success", `${u.name} is now ${ROLE_LABEL[json.systemRole]}.`);
    } catch {
      showToast("error", "Network error.");
    }
  }

  /**
   * Deactivating is instant and reversible: the toast offers Undo for 10 s (it just sets the account active
   * again; deactivation revokes nothing else, so nothing needs restoring). Activating needs no undo.
   */
  async function setActive(u: UserRecord, active: boolean, isUndo = false) {
    if (u.id === selfId) { showToast("error", "You cannot deactivate your own account."); return; }
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/status`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ active }),
      });
      const json = await res.json() as UserRecord & { error?: string };
      if (!res.ok) { showToast("error", json.error ?? `Could not ${active ? "activate" : "deactivate"} user.`); return; }
      queryClient.setQueryData(usersQueryKey, (old: typeof usersQuery.data) => old && {
        ...old, users: old.users.map((x) => x.id === u.id ? { ...x, active: json.active } : x),
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      if (active) {
        showToast("success", isUndo ? `${u.name} is active again.` : `${u.name} activated.`);
      } else {
        toastApi.showToast({
          message:     `${u.name} deactivated.`,
          actionLabel: "Undo",
          durationMs:  UNDO_WINDOW_MS,
          onAction:    () => { void setActive(u, true, true); },
        });
      }
    } catch {
      showToast("error", "Network error.");
    }
  }

  async function unlockUser(u: UserRecord) {
    try {
      const res  = await fetch(`/api/admin/users/${u.id}/unlock`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as UserRecord & { error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not unlock account."); return; }
      queryClient.setQueryData(usersQueryKey, (old: typeof usersQuery.data) => old && {
        ...old, users: old.users.map((x) => x.id === u.id ? { ...x, lockedUntil: json.lockedUntil } : x),
      });
      showToast("success", `${u.name}'s account unlocked.`);
    } catch {
      showToast("error", "Network error.");
    }
  }

  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function deleteUser(u: UserRecord) {
    setDeleting(true);
    try {
      const res  = await fetch(`/api/admin/users/${u.id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json() as { message?: string; error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not delete user."); return; }
      showToast("success", json.message ?? `${u.name} deleted.`);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch {
      showToast("error", "Network error.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  // ── Institution overview state ─────────────────────────────────────────────
  const overviewQuery = useAdminOverviewQuery(token);
  const overview = overviewQuery.data ?? null;
  const overviewLoading = overviewQuery.isLoading;
  const overviewError = overviewQuery.isError
    ? (overviewQuery.error instanceof Error ? overviewQuery.error.message : "Could not load overview.")
    : "";
  function loadOverview() { void overviewQuery.refetch(); }

  // ── Departments state ──────────────────────────────────────────────────────
  const departmentsQuery = useAdminDepartmentsQuery(token);
  const departments = departmentsQuery.data ?? [];
  const departmentsLoading = departmentsQuery.isLoading;
  const departmentsError = departmentsQuery.isError
    ? (departmentsQuery.error instanceof Error ? departmentsQuery.error.message : "Could not load departments.")
    : "";
  const [showDeptForm,       setShowDeptForm]       = useState(false);
  const [deptName,           setDeptName]           = useState("");
  const [deptCode,           setDeptCode]           = useState("");
  const [deptSubmitting,     setDeptSubmitting]     = useState(false);

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim()) return;
    setDeptSubmitting(true);
    try {
      const res  = await fetch("/api/admin/departments", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name: deptName.trim(), code: deptCode.trim() }),
      });
      const json = await res.json() as { name?: string; error?: string };
      if (!res.ok) { showToast("error", json.error ?? "Could not create department."); return; }
      showToast("success", `Department "${json.name}" created.`);
      setDeptName(""); setDeptCode(""); setShowDeptForm(false);
      await departmentsQuery.refetch();
    } catch {
      showToast("error", "Network error.");
    } finally {
      setDeptSubmitting(false);
    }
  }

  /** Clicking the active column flips the direction; a new column starts in its natural direction. */
  function sortBy(sort: UserSort) {
    updateView(view.sort === sort ? { dir: view.dir === "asc" ? "desc" : "asc" } : { sort, dir: defaultDir(sort) });
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 space-y-8">

        {/* Page heading */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">Admin Panel</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              User accounts and system settings.
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
                <div className="mt-0.5 flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-slate-600">
                    {usersMeta.total} {usersMeta.total === 1 ? "user" : "users"}
                  </p>
                  {(usersMeta.formerCount > 0 || view.former) && (
                    <label className="ft-hit inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={view.former}
                        onChange={(e) => updateView({ former: e.target.checked })}
                      />
                      Show former members ({usersMeta.formerCount})
                    </label>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={searchRef}
                type="search"
                aria-label="Search users (press / to focus)"
                placeholder="Search name or email…  ( / )"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 w-56 min-h-8"
              />
              <select
                aria-label="Filter by role"
                value={view.role}
                onChange={(e) => updateView({ role: e.target.value as AdminUsersView["role"] })}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer min-h-8"
              >
                <option value="">All roles</option>
                <option value="ADMIN">Admin</option>
                <option value="INSTRUCTOR">Instructor</option>
                <option value="STUDENT">Student</option>
              </select>
              <select
                aria-label="Filter by status"
                value={view.status}
                onChange={(e) => updateView({ status: e.target.value as AdminUsersView["status"] })}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer min-h-8"
              >
                <option value="">Any status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                aria-label="Filter by last active"
                value={view.lastActive}
                onChange={(e) => updateView({ lastActive: e.target.value as AdminUsersView["lastActive"] })}
                className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer min-h-8"
              >
                <option value="">Any last active</option>
                <option value="7d">Active in last 7 days</option>
                <option value="30d">Active in last 30 days</option>
                <option value="never">Never signed in</option>
              </select>
              <button
                onClick={loadUsers}
                className="ft-hit rounded px-2 text-xs text-slate-600 hover:text-slate-700 font-medium transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {deleteTarget && (
            <ConfirmDialog
              title={`Delete ${deleteTarget.name}?`}
              confirmLabel="Delete user"
              busyLabel="Deleting…"
              busy={deleting}
              onConfirm={() => void deleteUser(deleteTarget)}
              onCancel={() => setDeleteTarget(null)}
            >
              <p>{deleteTarget.email}</p>
              <p className="mt-2">
                The account is anonymised: their name, email, photo and sign-in are removed and cannot be recovered.
                Their work stays in the reports it already appears in, shown as "Former member", so teammates' results do not change.
              </p>
              <p className="mt-2">
                A group leader or an instructor who owns classes must be handed over first. This cannot be undone.
              </p>
            </ConfirmDialog>
          )}

          {roleChange && (
            <ConfirmDialog
              title={`Change ${roleChange.user.name}'s role?`}
              confirmLabel="Change role"
              onConfirm={() => void performRoleChange(roleChange.user, roleChange.newRole)}
              onCancel={() => setRoleChange(null)}
            >
              <p>From {ROLE_LABEL[roleChange.user.systemRole]} to {ROLE_LABEL[roleChange.newRole]}.</p>
            </ConfirmDialog>
          )}

          {/* Loading */}
          {usersLoading && (
            <div className="flex items-center justify-center gap-2 py-14 text-slate-600 text-sm">
              <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
              Loading…
            </div>
          )}

          {/* Error */}
          {!usersLoading && usersError && (
            <div className="px-6 py-14 text-center space-y-2">
              <p className="text-sm text-red-600">{usersError}</p>
              <button onClick={loadUsers} className="ft-hit rounded px-2 text-xs text-indigo-600 hover:underline">Retry</button>
            </div>
          )}

          {/* Empty */}
          {!usersLoading && !usersError && displayedUsers.length === 0 && (
            <p className="px-6 py-14 text-center text-sm text-slate-600">No users match your filters.</p>
          )}

          {/* Table */}
          {!usersLoading && !usersError && displayedUsers.length > 0 && (
            <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <SortHeader label="Name / Email" sort="name" view={view} onSort={sortBy} />
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-widest">Role</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-widest hidden sm:table-cell">GitHub</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-widest">Status</th>
                    <SortHeader label="Joined" sort="joined" view={view} onSort={sortBy} className="hidden md:table-cell" />
                    <SortHeader label="Last active" sort="lastActive" view={view} onSort={sortBy} className="hidden lg:table-cell" />
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayedUsers.map((u, i) => {
                    const isSelf = u.id === selfId;
                    const stripe = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                    const isFormer = !!u.deletedAt;
                    return (
                      <tr key={u.id} className={`text-sm transition-colors hover:bg-slate-100 ${stripe} ${isFormer ? "text-slate-500" : !u.active ? "opacity-50" : ""}`}>

                        {/* Name / Email */}
                        <td className="px-5 py-3.5 min-w-[180px]">
                          <p className="font-medium text-slate-800 leading-tight">{u.name}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{u.email}</p>
                          {isSelf && (
                            <span className="text-xs text-indigo-700 font-semibold">you</span>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-5 py-3.5">
                          <span className={`text-xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${ROLE_BADGE[u.systemRole]}`}>
                            {u.systemRole}
                          </span>
                        </td>

                        {/* GitHub */}
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          {u.githubUsername
                            ? <span className="text-xs font-mono text-slate-600">{u.githubUsername}</span>
                            : <span className="text-xs text-slate-600">—</span>}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isFormer ? (
                              <span className="text-xs font-bold px-1.5 py-0.5 rounded border text-slate-600 bg-slate-100 border-slate-300">
                                Deleted account
                              </span>
                            ) : (
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${
                                u.active
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                  : "text-slate-500 bg-slate-100 border-slate-200"
                              }`}>
                                {u.active ? "Active" : "Inactive"}
                              </span>
                            )}
                            {u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now() && (
                              <span
                                className="text-xs font-bold px-1.5 py-0.5 rounded border text-amber-700 bg-amber-50 border-amber-200"
                                title="Too many failed login attempts — auto-unlocks after a cooldown, or unlock now below"
                              >
                                Locked
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Joined */}
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <span className="text-xs text-slate-600">
                            {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </td>

                        {/* Last active */}
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          <span className="text-xs text-slate-600">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Never"}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5">
                          {isSelf || isFormer ? (
                            <span className="text-xs text-slate-600 block text-right">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Role select */}
                              <select
                                value={u.systemRole}
                                onChange={(e) => changeRole(u, e.target.value)}
                                className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer"
                                title="Change role"
                              >
                                <option value="ADMIN">Admin</option>
                                <option value="INSTRUCTOR">Instructor</option>
                                <option value="STUDENT">Student</option>
                              </select>

                              {/* Activate / Deactivate */}
                              <button
                                onClick={() => void setActive(u, !u.active)}
                                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                                  u.active
                                    ? "border-slate-200 text-slate-700 hover:border-red-200 hover:text-red-700 hover:bg-red-50"
                                    : "border-slate-200 text-slate-700 hover:border-emerald-200 hover:text-emerald-700 hover:bg-emerald-50"
                                }`}
                                title={u.active ? "Deactivate account" : "Activate account"}
                              >
                                {u.active ? "Deactivate" : "Activate"}
                              </button>

                              {/* Unlock */}
                              {u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now() && (
                                <button
                                  onClick={() => { void unlockUser(u); }}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:border-amber-200 hover:text-amber-800 hover:bg-amber-50 font-medium transition-colors"
                                  title="Clear login lockout now"
                                >
                                  Unlock
                                </button>
                              )}

                              <OverflowMenu
                                label={`More actions for ${u.name}`}
                                items={[{ label: "Delete user…", tone: "danger", onSelect: () => setDeleteTarget(u) }]}
                              />
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
                page={view.page}
                totalPages={usersMeta.totalPages}
                total={usersMeta.total}
                pageSize={usersMeta.pageSize}
                onPage={(page) => setView((v) => ({ ...v, page }))}
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
              Accounts overview
            </h2>
            <button
              onClick={loadOverview}
              className="ft-hit rounded px-2 text-xs text-slate-600 hover:text-slate-700 font-medium transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* Stat cards */}
          {overviewLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
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
              <button onClick={loadOverview} className="ft-hit rounded px-2 text-xs text-indigo-600 hover:underline">Retry</button>
            </div>
          )}

          {!overviewLoading && !overviewError && overview && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: "Admins",      value: overview.users.admins,      textCls: "text-violet-700",  borderCls: "border-violet-200" },
                  { label: "Instructors", value: overview.users.instructors, textCls: "text-indigo-700",  borderCls: "border-indigo-200" },
                  { label: "Students",    value: overview.users.students,    textCls: "text-slate-700",   borderCls: "border-slate-200"  },
                  { label: "Active",      value: overview.users.active,      textCls: "text-emerald-700", borderCls: "border-emerald-200" },
                  { label: "Inactive",    value: overview.users.inactive,    textCls: "text-slate-700",   borderCls: "border-slate-200"  },
                ].map(({ label, value, textCls, borderCls }) => (
                  <div key={label} className={`bg-white border ${borderCls} rounded-xl p-4 text-center`}>
                    <p className={`text-3xl font-bold ${textCls}`}>{value}</p>
                    <p className="text-xs text-slate-600 mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* ── Hierarchy Management ─────────────────────────────────────────────── */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1">
            Hierarchy Management
          </h2>
          <p className="text-xs text-slate-600 mb-5">
            Create departments and approve new instructor accounts.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-600">Departments</p>
                <button
                  onClick={() => setShowDeptForm((v) => !v)}
                  className="ft-hit rounded px-2 text-xs font-semibold text-indigo-700 hover:text-indigo-900 transition-colors"
                >
                  {showDeptForm ? "Cancel" : "+ New"}
                </button>
              </div>
              <p className="text-xs text-slate-600 mb-3">Instructors pick from this list when creating a class section.</p>

              {showDeptForm && (
                <form onSubmit={(e) => void createDepartment(e)} className="space-y-2 mb-3">
                  <input
                    required
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="e.g. College of Computer Studies"
                    className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                  <input
                    required
                    value={deptCode}
                    onChange={(e) => setDeptCode(e.target.value)}
                    placeholder="e.g. CCS"
                    className="w-full rounded-lg bg-white border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={deptSubmitting || !deptName.trim() || !deptCode.trim()}
                    className="w-full px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-600 text-white text-sm font-semibold transition-colors"
                  >
                    {deptSubmitting ? "Creating…" : "Create"}
                  </button>
                </form>
              )}

              {departmentsLoading && <p className="text-xs text-slate-600">Loading…</p>}
              {!departmentsLoading && departmentsError && <p className="text-xs text-red-600">{departmentsError}</p>}
              {!departmentsLoading && !departmentsError && departments.length === 0 && (
                <p className="text-xs text-slate-600">No departments yet.</p>
              )}
              {!departmentsLoading && !departmentsError && departments.length > 0 && (
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {departments.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 truncate">{d.name}</span>
                      <span className="text-slate-600 font-mono ml-2 shrink-0">{d.code}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <InstructorApprovals onToast={showToast} />
            <DeletionRequests onToast={showToast} />
          </div>
        </section>

      </main>

      <AppFooter />
    </div>
  );
}
