import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { POLL_60S } from "./pollingOptions";

/**
 * Query keys for the student/group surfaces. userId is the second element of every key so a
 * prefix like ["group", userId] invalidates one user's group data, and nothing leaks across
 * accounts (the cache is also cleared on logout).
 */
export const groupKeys = {
  all:             (uid: number | null) => ["group", uid] as const,
  detail:          (uid: number | null, pid: number) => ["group", uid, "detail", pid] as const,
  manage:          (uid: number | null, pid: number) => ["group", uid, "manage", pid] as const,
  requests:        (uid: number | null, pid: number) => ["group", uid, "requests", pid] as const,
  roleSuggestions: (uid: number | null, pid: number) => ["group", uid, "role-suggestions", pid] as const,
  tasks:           (uid: number | null, pid: number) => ["group", uid, "tasks", pid] as const,
};
export const disputeKeys = {
  all:  (uid: number | null) => ["disputes", uid] as const,
  mine: (uid: number | null) => ["disputes", uid, "mine"] as const,
  list: (uid: number | null, filters: object) => ["disputes", uid, "list", filters] as const,
};
export const classKeys = {
  all:      (uid: number | null) => ["class", uid] as const,
  projects: (uid: number | null, classId: number) => ["class", uid, "projects", classId] as const,
};

/** Error carrying the HTTP status so callers can react to 403/404 (e.g. redirect). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(url: string, token: string | null, fallback: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? fallback);
  return json;
}

/** GET /api/student/group/:id — reads the stored report only (never recomputes). */
export function useStudentGroupQuery<T>(projectId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: groupKeys.detail(uid, projectId),
    queryFn:  () => getJson<T>(`/api/student/group/${projectId}`, token, "Could not load group."),
    enabled:  !!token && uid !== null,
    refetchOnWindowFocus: true, // no interval: covers renames, role sets, joins/leaves with no alert
    retry: false,
  });
}

/** Group tasks. Polls every 60 s (foreground only) while any consumer is mounted. */
export function useGroupTasksQuery<TTask>(projectId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: groupKeys.tasks(uid, projectId),
    queryFn:  async () => (await getJson<{ tasks?: TTask[] }>(`/api/groups/${projectId}/tasks`, token, "Could not load tasks.")).tasks ?? [],
    enabled:  !!token && uid !== null,
    ...POLL_60S,
  });
}

export function useMyDisputesQuery<T>() {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: disputeKeys.mine(uid),
    queryFn:  async () => (await getJson<{ disputes: T[] }>("/api/disputes/mine", token, "Could not load disputes.")).disputes,
    enabled:  !!token && uid !== null,
  });
}

/** GET /api/groups/:id — shared by GroupManageModal and TaskManageModal. Always revalidates on open. */
export function useGroupManageQuery<T>(projectId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: groupKeys.manage(uid, projectId),
    queryFn:  () => getJson<T>(`/api/groups/${projectId}`, token, "Could not load group."),
    enabled:  !!token && uid !== null,
    staleTime: 0,
  });
}

export function useGroupRequestsQuery<T>(projectId: number, enabled: boolean) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: groupKeys.requests(uid, projectId),
    queryFn:  async () => (await getJson<{ requests?: T[] }>(`/api/groups/${projectId}/requests`, token, "Could not load requests.")).requests ?? [],
    enabled:  enabled && !!token && uid !== null,
    staleTime: 0,
  });
}

export function useRoleSuggestionsQuery<T>(projectId: number, enabled: boolean) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: groupKeys.roleSuggestions(uid, projectId),
    queryFn:  async () => (await getJson<{ suggestions?: T[] }>(`/api/groups/${projectId}/role-suggestions`, token, "Could not load role suggestions.")).suggestions ?? [],
    enabled:  enabled && !!token && uid !== null,
    staleTime: 0,
  });
}

/** Student class page data (assignments, groups, own join-request status). */
export function useClassProjectsQuery<T>(classId: number) {
  const { token, user } = useAuth();
  const uid = user?.id ?? null;
  return useQuery({
    queryKey: classKeys.projects(uid, classId),
    queryFn:  () => getJson<T>(`/api/student/classes/${classId}/projects`, token, "Could not load class."),
    enabled:  !!token && uid !== null,
    staleTime: 0,
    refetchOnWindowFocus: true, // classmates' new groups raise no alert for students
    retry: false,
  });
}
