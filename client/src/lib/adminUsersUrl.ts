// Admin user list filters kept in the URL (?q=&role=&status=&active=&sort=&dir=&page=&former=1),
// so a reload, the back button and a shared link keep the same view. Other params (e.g. ?section=) are left alone.

export type UserSort = "name" | "joined" | "lastActive";
export type SortDir = "asc" | "desc";

export interface AdminUsersView {
  q: string;
  role: "" | "ADMIN" | "INSTRUCTOR" | "STUDENT";
  status: "" | "active" | "inactive";
  lastActive: "" | "7d" | "30d" | "never";
  sort: UserSort;
  dir: SortDir;
  page: number;
  former: boolean;
}

export const DEFAULT_VIEW: AdminUsersView = {
  q: "", role: "", status: "", lastActive: "", sort: "joined", dir: "desc", page: 1, former: false,
};

const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Direction a column starts in when first chosen: names A to Z, dates newest first. */
export const defaultDir = (sort: UserSort): SortDir => (sort === "name" ? "asc" : "desc");

export function parseAdminUsersView(search: string): AdminUsersView {
  const p = new URLSearchParams(search);
  const sort = pick(p.get("sort"), ["name", "joined", "lastActive"] as const, "joined");
  const page = parseInt(p.get("page") ?? "1", 10);
  return {
    q: p.get("q") ?? "",
    role: pick(p.get("role"), ["", "ADMIN", "INSTRUCTOR", "STUDENT"] as const, ""),
    status: pick(p.get("status"), ["", "active", "inactive"] as const, ""),
    lastActive: pick(p.get("active"), ["", "7d", "30d", "never"] as const, ""),
    sort,
    dir: pick(p.get("dir"), ["asc", "desc"] as const, defaultDir(sort)),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    former: p.get("former") === "1",
  };
}

/** Query string for `view`, keeping any params in `existing` that this list does not own. Defaults are omitted. */
export function serializeAdminUsersView(view: AdminUsersView, existing: string = ""): string {
  const p = new URLSearchParams(existing);
  for (const k of ["q", "role", "status", "active", "sort", "dir", "page", "former"]) p.delete(k);
  if (view.q) p.set("q", view.q);
  if (view.role) p.set("role", view.role);
  if (view.status) p.set("status", view.status);
  if (view.lastActive) p.set("active", view.lastActive);
  if (view.sort !== DEFAULT_VIEW.sort || view.dir !== defaultDir(view.sort)) {
    p.set("sort", view.sort);
    p.set("dir", view.dir);
  }
  if (view.page > 1) p.set("page", String(view.page));
  if (view.former) p.set("former", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** True when anything narrows the list (sort and page do not count). */
export const hasActiveFilters = (v: AdminUsersView): boolean =>
  !!(v.q || v.role || v.status || v.lastActive);

/** Same view with every filter cleared; sort stays, page resets. */
export const clearFilters = (v: AdminUsersView): AdminUsersView =>
  ({ ...v, q: "", role: "", status: "", lastActive: "", page: 1 });
