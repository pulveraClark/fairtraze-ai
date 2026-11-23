import { useQuery } from "@tanstack/react-query";

interface UserRecord {
  id:             number;
  name:           string;
  email:          string;
  systemRole:     "ADMIN" | "INSTRUCTOR" | "STUDENT";
  githubUsername: string | null;
  active:         boolean;
  lockedUntil:    string | null;
  createdAt:      string;
  lastLoginAt:    string | null;
  deletedAt:      string | null;
}

interface UsersPage {
  users:       UserRecord[];
  total:       number;
  formerCount: number;
  totalPages: number;
  pageSize:   number;
}

interface OverviewData {
  users: { total: number; admins: number; instructors: number; students: number; active: number; inactive: number };
}

interface DepartmentItem {
  id:        number;
  name:      string;
  code:      string;
  createdAt: string;
  _count:    { classSections: number };
}

export interface AdminUsersParams {
  page:          number;
  search:        string;
  roleFilter:    string;
  status:        string;
  lastActive:    string;
  sort:          string;
  dir:           string;
  includeFormer: boolean;
}

export const adminUsersKey = (p: AdminUsersParams) =>
  ["admin-users", p.page, p.search, p.roleFilter, p.status, p.lastActive, p.sort, p.dir, p.includeFormer] as const;

/** Query string for the users list and the CSV export (everything except paging). */
export function adminUsersFilterQuery(p: Omit<AdminUsersParams, "page">): URLSearchParams {
  const qs = new URLSearchParams();
  if (p.search)     qs.set("search", p.search);
  if (p.roleFilter) qs.set("role", p.roleFilter);
  if (p.status)     qs.set("status", p.status);
  if (p.lastActive) qs.set("lastActive", p.lastActive);
  qs.set("sort", p.sort);
  qs.set("dir", p.dir);
  if (p.includeFormer) qs.set("includeFormer", "true");
  return qs;
}

/** Admin users list, keyed on every filter, the sort and the page (mirrors the query string sent to the API). */
export function useAdminUsersQuery(token: string | null, params: AdminUsersParams) {
  return useQuery({
    queryKey: adminUsersKey(params),
    queryFn: async () => {
      const qs = adminUsersFilterQuery(params);
      qs.set("page", String(params.page));
      qs.set("pageSize", "10");
      const res  = await fetch(`/api/admin/users?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as Partial<UsersPage> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load users.");
      return {
        users:      json.users ?? [],
        total:      json.total ?? 0,
        formerCount: json.formerCount ?? 0,
        totalPages: json.totalPages ?? 1,
        pageSize:   json.pageSize ?? 10,
      } satisfies UsersPage;
    },
    enabled: !!token,
  });
}

export function useAdminOverviewQuery(token: string | null) {
  return useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const res  = await fetch("/api/admin/overview", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as OverviewData & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load overview.");
      return json;
    },
    enabled: !!token,
  });
}

export function useAdminDepartmentsQuery(token: string | null) {
  return useQuery({
    queryKey: ["admin-departments"],
    queryFn: async () => {
      const res  = await fetch("/api/admin/departments", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { departments?: DepartmentItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load departments.");
      return json.departments ?? [];
    },
    enabled: !!token,
  });
}

export interface AdminUserDetails { classCount: number; groupCount: number }

/** Counts for the user details panel; only fetched while the panel is open. */
export function useAdminUserDetailsQuery(token: string | null, userId: number | null) {
  return useQuery({
    queryKey: ["admin-user-details", userId],
    queryFn: async () => {
      const res  = await fetch(`/api/admin/users/${userId}/details`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as Partial<AdminUserDetails> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load details.");
      return { classCount: json.classCount ?? 0, groupCount: json.groupCount ?? 0 } satisfies AdminUserDetails;
    },
    enabled: !!token && userId !== null,
  });
}
