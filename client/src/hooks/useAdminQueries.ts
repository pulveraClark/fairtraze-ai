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

/** Admin users list, keyed on the current page/search/role filter (mirrors the query string sent to the API). */
export function useAdminUsersQuery(
  token: string | null,
  params: { page: number; search: string; roleFilter: string; includeFormer: boolean }
) {
  return useQuery({
    queryKey: ["admin-users", params.page, params.search, params.roleFilter, params.includeFormer],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(params.page), pageSize: "10" });
      if (params.search)    qs.set("search", params.search);
      if (params.roleFilter) qs.set("role", params.roleFilter);
      if (params.includeFormer) qs.set("includeFormer", "true");
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
