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
}

interface UsersPage {
  users:      UserRecord[];
  total:      number;
  totalPages: number;
  pageSize:   number;
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

interface ClassSectionItem {
  id:          number;
  subjectCode: string;
  subjectName: string;
  edpCode:     string;
  department:  { id: number; name: string; code: string } | null;
  type:        string;
  createdAt:   string;
  instructor:  { id: number; name: string; email: string };
  assignments: Array<{ id: number; title: string; _count: { projects: number } }>;
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
  params: { page: number; search: string; roleFilter: string }
) {
  return useQuery({
    queryKey: ["admin-users", params.page, params.search, params.roleFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(params.page), pageSize: "20" });
      if (params.search)     qs.set("search", params.search);
      if (params.roleFilter) qs.set("role", params.roleFilter);
      const res  = await fetch(`/api/admin/users?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as Partial<UsersPage> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load users.");
      return {
        users:      json.users ?? [],
        total:      json.total ?? 0,
        totalPages: json.totalPages ?? 1,
        pageSize:   json.pageSize ?? 20,
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

export function useAdminClassesQuery(token: string | null) {
  return useQuery({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const res  = await fetch("/api/admin/classes", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { classes?: ClassSectionItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load classes.");
      return json.classes ?? [];
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
