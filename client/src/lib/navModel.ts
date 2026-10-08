// Pure navigation model for the sidebar: which top-level items a role sees and how the
// class → group tree is derived from data the app already fetches. No React, no I/O.

export type SystemRole = "ADMIN" | "INSTRUCTOR" | "STUDENT";
export type NavIconName = "home" | "classes" | "disputes" | "bell" | "settings" | "audit";

export const MAX_CLASSES = 8;
export const MAX_GROUPS  = 8;

export interface NavItemDef {
  key: "dashboard" | "classes" | "disputes" | "notifications" | "settings" | "audit";
  label: string;
  href: string;
  icon: NavIconName;
}

export function getNavItems(role: SystemRole): NavItemDef[] {
  const notifications: NavItemDef = { key: "notifications", label: "Notifications", href: "/alerts",   icon: "bell" };
  const settings: NavItemDef      = { key: "settings",      label: "Settings",      href: "/settings", icon: "settings" };
  if (role === "ADMIN") {
    return [
      { key: "dashboard", label: "Admin dashboard", href: "/admin",       icon: "home" },
      { key: "audit",     label: "Audit log",       href: "/admin/audit", icon: "audit" },
      notifications,
      settings,
    ];
  }
  if (role === "INSTRUCTOR") {
    return [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "home" },
      { key: "classes",   label: "Classes",   href: "/dashboard", icon: "classes" },
      { key: "disputes",  label: "Disputes",  href: "/disputes",  icon: "disputes" },
      notifications,
      settings,
    ];
  }
  return [
    { key: "dashboard", label: "Dashboard",  href: "/student", icon: "home" },
    { key: "classes",   label: "My classes", href: "/student", icon: "classes" },
    notifications,
    settings,
  ];
}

/** Whether a top-level item is the current page. "classes" is active only on class-scoped routes. */
export function isItemActive(role: SystemRole, key: NavItemDef["key"], href: string, pathname: string): boolean {
  if (key === "classes") {
    return role === "STUDENT"
      ? pathname.startsWith("/student/class/") || pathname.startsWith("/student/group/")
      : pathname.startsWith("/class/") || pathname.startsWith("/project/");
  }
  return pathname === href;
}

// ── Class → group tree ───────────────────────────────────────────────────────

export interface InstructorClassInput {
  id: number;
  subjectCode?: string | null;
  subjectName?: string | null;
  assignments?: { id: number }[];
}
export interface GroupSummaryInput {
  projectId: number;
  groupName: string;
  classId?: number | null;
}
export interface StudentClassInput {
  id: number;
  subjectCode?: string | null;
  subjectName?: string | null;
  assignments?: { myGroup: { id: number; groupName: string } | null }[];
}

export interface NavGroup {
  id: number;
  label: string;
  href: string;
  active: boolean;
}
export interface NavClass {
  id: number;
  label: string;
  title: string;
  href: string;
  active: boolean;
  groups: NavGroup[];
  hiddenGroupCount: number;
}
export interface NavTree {
  classes: NavClass[];
  hiddenClassCount: number;
  viewAllHref: string;
}

function classLabel(c: { subjectCode?: string | null; subjectName?: string | null; id: number }): string {
  return c.subjectCode || c.subjectName || `Class ${c.id}`;
}

/** Class id the current route belongs to, or null when none can be determined (yet). */
export function resolveActiveClassId(
  role: SystemRole,
  pathname: string,
  instructorGroups: GroupSummaryInput[] | undefined,
  studentClasses: StudentClassInput[] | undefined
): number | null {
  if (role === "INSTRUCTOR" || role === "ADMIN") {
    const cls = pathname.match(/^\/class\/(\d+)/);
    if (cls) return parseInt(cls[1], 10);
    const proj = pathname.match(/^\/project\/(\d+)$/);
    if (proj) {
      const pid = parseInt(proj[1], 10);
      return instructorGroups?.find((g) => g.projectId === pid)?.classId ?? null;
    }
    return null;
  }
  const cls = pathname.match(/^\/student\/class\/(\d+)/);
  if (cls) return parseInt(cls[1], 10);
  const grp = pathname.match(/^\/student\/group\/(\d+)$/);
  if (grp) {
    const gid = parseInt(grp[1], 10);
    return studentClasses?.find((c) => c.assignments?.some((a) => a.myGroup?.id === gid))?.id ?? null;
  }
  return null;
}

/** Cap at MAX_CLASSES, but never drop the active class: it replaces the last visible slot. */
function capClasses<T extends { id: number }>(all: T[], activeClassId: number | null): { shown: T[]; hidden: number } {
  if (all.length <= MAX_CLASSES) return { shown: all, hidden: 0 };
  const shown = all.slice(0, MAX_CLASSES);
  const active = activeClassId === null ? undefined : all.find((c) => c.id === activeClassId);
  if (active && !shown.includes(active)) shown[MAX_CLASSES - 1] = active;
  return { shown, hidden: all.length - MAX_CLASSES };
}

function capGroups(groups: NavGroup[]): { groups: NavGroup[]; hidden: number } {
  if (groups.length <= MAX_GROUPS) return { groups, hidden: 0 };
  const active = groups.find((g) => g.active);
  const shown = groups.slice(0, MAX_GROUPS);
  if (active && !shown.includes(active)) shown[MAX_GROUPS - 1] = active;
  return { groups: shown, hidden: groups.length - MAX_GROUPS };
}

export function buildInstructorTree(
  classes: InstructorClassInput[],
  groups: GroupSummaryInput[] | undefined,
  pathname: string,
  activeClassId: number | null
): NavTree {
  const { shown, hidden } = capClasses(classes, activeClassId);
  return {
    hiddenClassCount: hidden,
    viewAllHref: "/dashboard",
    classes: shown.map((c) => {
      const all: NavGroup[] = (groups ?? [])
        .filter((g) => g.classId === c.id)
        .map((g) => ({
          id: g.projectId,
          label: g.groupName || `Group ${g.projectId}`,
          href: `/project/${g.projectId}`,
          active: pathname === `/project/${g.projectId}`,
        }));
      const capped = capGroups(all);
      return {
        id: c.id,
        label: classLabel(c),
        title: c.subjectName || classLabel(c),
        href: `/class/${c.id}`,
        active: pathname === `/class/${c.id}` || pathname.startsWith(`/class/${c.id}/`),
        groups: capped.groups,
        hiddenGroupCount: capped.hidden,
      };
    }),
  };
}

export function buildStudentTree(
  classes: StudentClassInput[],
  pathname: string,
  activeClassId: number | null
): NavTree {
  const { shown, hidden } = capClasses(classes, activeClassId);
  return {
    hiddenClassCount: hidden,
    viewAllHref: "/student",
    classes: shown.map((c) => {
      // Students only ever see their own group(s) here — never classmates' groups.
      const all: NavGroup[] = (c.assignments ?? [])
        .map((a) => a.myGroup)
        .filter((g): g is { id: number; groupName: string } => g !== null)
        .map((g) => ({
          id: g.id,
          label: g.groupName || `Group ${g.id}`,
          href: `/student/group/${g.id}`,
          active: pathname === `/student/group/${g.id}`,
        }));
      const capped = capGroups(all);
      return {
        id: c.id,
        label: classLabel(c),
        title: c.subjectName || classLabel(c),
        href: `/student/class/${c.id}`,
        active: pathname === `/student/class/${c.id}`,
        groups: capped.groups,
        hiddenGroupCount: capped.hidden,
      };
    }),
  };
}
