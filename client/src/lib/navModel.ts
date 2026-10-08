// Pure navigation model for the sidebar: which top-level items a role sees and how the
// class → project → group tree is derived from data the app already fetches. No React, no I/O.

export type SystemRole = "ADMIN" | "INSTRUCTOR" | "STUDENT";
export type NavIconName = "home" | "classes" | "disputes" | "bell" | "settings" | "audit";

export const MAX_CLASSES  = 8;
export const MAX_PROJECTS = 8;
export const MAX_GROUPS   = 8;

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

// ── Class → project → group tree ─────────────────────────────────────────────

export interface InstructorClassInput {
  id: number;
  subjectCode?: string | null;
  subjectName?: string | null;
  assignments?: { id: number; title?: string | null }[];
}
export interface GroupSummaryInput {
  projectId: number;
  groupName: string;
  classId?: number | null;
  assignmentId?: number | null;
}
export interface StudentClassInput {
  id: number;
  subjectCode?: string | null;
  subjectName?: string | null;
  assignments?: { id?: number; title?: string | null; myGroup: { id: number; groupName: string } | null }[];
}

export interface NavGroup {
  id: number;
  label: string;
  href: string;
  active: boolean;
}
export interface NavProject {
  id: number;
  label: string;
  href: string;
  active: boolean;
  /** Populated only for the active project; other projects show just their name. */
  groups: NavGroup[];
  hiddenGroupCount: number;
}
export interface NavClass {
  id: number;
  label: string;
  title: string;
  href: string;
  active: boolean;
  projects: NavProject[];
  hiddenProjectCount: number;
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

/** Assignment ("project") id the current route belongs to, or null when none can be determined (yet). */
export function resolveActiveAssignmentId(
  role: SystemRole,
  pathname: string,
  instructorGroups: GroupSummaryInput[] | undefined,
  studentClasses: StudentClassInput[] | undefined
): number | null {
  if (role === "INSTRUCTOR" || role === "ADMIN") {
    const asg = pathname.match(/^\/class\/\d+\/assignment\/(\d+)/);
    if (asg) return parseInt(asg[1], 10);
    const proj = pathname.match(/^\/project\/(\d+)$/);
    if (proj) {
      const pid = parseInt(proj[1], 10);
      return instructorGroups?.find((g) => g.projectId === pid)?.assignmentId ?? null;
    }
    return null;
  }
  const grp = pathname.match(/^\/student\/group\/(\d+)$/);
  if (grp) {
    const gid = parseInt(grp[1], 10);
    for (const c of studentClasses ?? []) {
      const a = c.assignments?.find((x) => x.myGroup?.id === gid);
      if (a) return a.id ?? null;
    }
  }
  return null;
}

/** Cap at `max`, but never drop the active entry: it replaces the last visible slot. */
function capKeepingActive<T>(all: T[], max: number, isActive: (item: T) => boolean): { shown: T[]; hidden: number } {
  if (all.length <= max) return { shown: all, hidden: 0 };
  const shown = all.slice(0, max);
  const active = all.find(isActive);
  if (active && !shown.includes(active)) shown[max - 1] = active;
  return { shown, hidden: all.length - max };
}

function buildProject(
  id: number,
  label: string,
  href: string,
  active: boolean,
  isActiveProject: boolean,
  groups: NavGroup[]
): NavProject {
  const capped = isActiveProject
    ? capKeepingActive(groups, MAX_GROUPS, (g) => g.active)
    : { shown: [] as NavGroup[], hidden: 0 };
  return { id, label, href, active, groups: capped.shown, hiddenGroupCount: capped.hidden };
}

export function buildInstructorTree(
  classes: InstructorClassInput[],
  groups: GroupSummaryInput[] | undefined,
  pathname: string,
  activeClassId: number | null,
  activeAssignmentId: number | null = null
): NavTree {
  const { shown, hidden } = capKeepingActive(classes, MAX_CLASSES, (c) => c.id === activeClassId);
  return {
    hiddenClassCount: hidden,
    viewAllHref: "/dashboard",
    classes: shown.map((c) => {
      const all = (c.assignments ?? []).map((a) => {
        const href = `/class/${c.id}/assignment/${a.id}`;
        const isActiveProject = a.id === activeAssignmentId;
        const projectGroups: NavGroup[] = isActiveProject
          ? (groups ?? [])
              .filter((g) => g.assignmentId === a.id)
              .map((g) => ({
                id: g.projectId,
                label: g.groupName || `Group ${g.projectId}`,
                href: `/project/${g.projectId}`,
                active: pathname === `/project/${g.projectId}`,
              }))
          : [];
        return buildProject(a.id, a.title || `Project ${a.id}`, href, pathname === href, isActiveProject, projectGroups);
      });
      const capped = capKeepingActive(all, MAX_PROJECTS, (p) => p.id === activeAssignmentId);
      return {
        id: c.id,
        label: classLabel(c),
        title: c.subjectName || classLabel(c),
        href: `/class/${c.id}`,
        active: pathname === `/class/${c.id}` || pathname.startsWith(`/class/${c.id}/`),
        projects: capped.shown,
        hiddenProjectCount: capped.hidden,
      };
    }),
  };
}

export function buildStudentTree(
  classes: StudentClassInput[],
  pathname: string,
  activeClassId: number | null,
  activeAssignmentId: number | null = null
): NavTree {
  const { shown, hidden } = capKeepingActive(classes, MAX_CLASSES, (c) => c.id === activeClassId);
  return {
    hiddenClassCount: hidden,
    viewAllHref: "/student",
    classes: shown.map((c) => {
      // Students only ever see their own project(s) and group here — never classmates' groups.
      // They have no per-assignment page, so a project links to its class page.
      const href = `/student/class/${c.id}`;
      const all = (c.assignments ?? [])
        .filter((a) => a.myGroup !== null)
        .map((a, i) => {
          const g = a.myGroup!;
          const id = a.id ?? -(i + 1);
          const isActiveProject = a.id !== undefined && a.id === activeAssignmentId;
          const group: NavGroup = {
            id: g.id,
            label: g.groupName || `Group ${g.id}`,
            href: `/student/group/${g.id}`,
            active: pathname === `/student/group/${g.id}`,
          };
          return buildProject(id, a.title || `Project ${id}`, href, false, isActiveProject, [group]);
        });
      const capped = capKeepingActive(all, MAX_PROJECTS, (p) => p.id === activeAssignmentId);
      return {
        id: c.id,
        label: classLabel(c),
        title: c.subjectName || classLabel(c),
        href,
        active: pathname === href,
        projects: capped.shown,
        hiddenProjectCount: capped.hidden,
      };
    }),
  };
}
