import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "../../router";
import { useAlerts } from "../../hooks/useAlerts";
import { useInvalidateOnAlertCount } from "../../hooks/useInvalidateOnAlertCount";
import { useClassesListQuery, useProjectsSummaryQuery } from "../../hooks/useSharedQueries";
import { STUDENT_CLASSES_KEY, useStudentClassesQuery } from "../../hooks/useStudentClassesQuery";
import { usePopover } from "../../hooks/usePopover";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import {
  buildInstructorTree,
  buildStudentTree,
  getNavItems,
  isItemActive,
  resolveActiveAssignmentId,
  resolveActiveClassId,
} from "../../lib/navModel";
import type { InstructorClassInput, NavItemDef, SystemRole } from "../../lib/navModel";
import { AVATAR_BG, AVATAR_STYLE, ROLE_BADGE_DARK, ROLE_LABEL, initials } from "../../lib/roleStyle";
import { AlertsBell } from "../AlertsBell";
import { ChevronIcon, CloseIcon, CollapseIcon, NavIcon, SignOutIcon } from "./icons";
import { FOCUS_RING, RAIL_TOOLTIP, navItemClass } from "./navStyles";
import logoUrl from "../../assets/logo_transparent.png";

export const SIDEBAR_ID = "app-sidebar";

// ── Link primitive ────────────────────────────────────────────────────────────

interface SidebarLinkProps {
  href: string;
  className: string;
  active?: boolean;
  ariaLabel?: string;
  title?: string;
  onNavigate?: () => void;
  children: ReactNode;
}

/** A real <a href>: middle-click / open-in-new-tab work; plain clicks use the in-app router. */
function SidebarLink({ href, className, active, ariaLabel, title, onNavigate, children }: SidebarLinkProps) {
  const { navigate } = useRouter();
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
    onNavigate?.();
  }
  return (
    <a
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={ariaLabel}
      title={title}
      className={className}
    >
      {children}
    </a>
  );
}

/** Top-level item: icon + label, or icon + tooltip in the collapsed rail. */
function NavLinkItem({
  item, active, collapsed, onNavigate, badge,
}: { item: NavItemDef; active: boolean; collapsed: boolean; onNavigate?: () => void; badge?: ReactNode }) {
  return (
    <div className="group relative">
      <SidebarLink
        href={item.href}
        active={active}
        ariaLabel={collapsed ? item.label : undefined}
        onNavigate={onNavigate}
        className={navItemClass(active, collapsed)}
      >
        <NavIcon name={item.icon} />
        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
        {!collapsed && badge}
      </SidebarLink>
      {collapsed && <span aria-hidden="true" className={RAIL_TOOLTIP}>{item.label}</span>}
    </div>
  );
}

/** Notifications as a plain link (mobile drawer): the flyout is desktop-only. */
function NotificationsLink({ item, active, onNavigate }: { item: NavItemDef; active: boolean; onNavigate?: () => void }) {
  const { unreadCount } = useAlerts();
  return (
    <NavLinkItem
      item={item}
      active={active}
      collapsed={false}
      onNavigate={onNavigate}
      badge={unreadCount > 0 && (
        <span className="min-w-[1.5rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-xs font-bold leading-none text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
          <span className="sr-only"> unread</span>
        </span>
      )}
    />
  );
}

// ── Class → project → group tree ────────────────────────────────────────────────────────

const treeLinkClass = (active: boolean, size: "base" | "sm") =>
  [
    "flex min-h-10 min-w-0 flex-1 items-center rounded-lg px-3",
    size === "base" ? "text-sm" : "text-sm",
    active ? "bg-white/10 font-semibold text-white" : "font-medium text-slate-300 hover:bg-white/5 hover:text-white",
    FOCUS_RING,
  ].join(" ");

const viewAllClass =
  `flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-indigo-300 underline-offset-2 hover:text-indigo-200 hover:underline ${FOCUS_RING}`;

function ClassTree({ role, onNavigate }: { role: SystemRole; onNavigate?: () => void }) {
  const { token } = useAuth();
  const { pathname } = useRouter();
  const reduced = usePrefersReducedMotion();
  const isInstructor = role === "INSTRUCTOR";
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  // Instructor: the two cached queries the dashboard already uses, joined by classId (no N+1).
  // The groups summary is only needed once a class is (or may be) expanded.
  const anyManual = Object.values(overrides).some(Boolean);
  const needsSummary = isInstructor && (/^\/(class|project)\//.test(pathname) || anyManual);
  const classesQ = useClassesListQuery<InstructorClassInput>(isInstructor ? token : null);
  const summaryQ = useProjectsSummaryQuery(needsSummary ? token : null);
  // Student: one request returning classes with the student's own group per assignment.
  const studentQ = useStudentClassesQuery(role === "STUDENT");

  useInvalidateOnAlertCount(
    isInstructor ? [["classes-list"], ["projects-summary"]] : [[STUDENT_CLASSES_KEY]]
  );

  const activeClassId = resolveActiveClassId(role, pathname, summaryQ.data, studentQ.data);
  const activeAssignmentId = resolveActiveAssignmentId(role, pathname, summaryQ.data, studentQ.data);
  // Only the active class auto-expands; changing class drops manual overrides.
  useEffect(() => { setOverrides({}); }, [activeClassId]);

  const query = isInstructor ? classesQ : studentQ;
  if (query.isLoading) return <p className="px-3 py-2 text-sm text-slate-400">Loading classes…</p>;
  if (query.isError)   return <p className="px-3 py-2 text-sm text-slate-300">Couldn't load classes.</p>;

  const tree = isInstructor
    ? buildInstructorTree(classesQ.data ?? [], summaryQ.data, pathname, activeClassId, activeAssignmentId)
    : buildStudentTree(studentQ.data ?? [], pathname, activeClassId, activeAssignmentId);

  if (tree.classes.length === 0) {
    return <p className="px-3 py-2 text-sm text-slate-400">{isInstructor ? "No classes yet." : "You haven't joined a class yet."}</p>;
  }

  return (
    <ul className="space-y-0.5">
      {tree.classes.map((c) => {
        const expanded = overrides[c.id] ?? c.id === activeClassId;
        const listId = `nav-class-${c.id}`;
        return (
          <li key={c.id}>
            <div className="flex items-stretch">
              <SidebarLink href={c.href} active={c.active} title={c.title} onNavigate={onNavigate} className={treeLinkClass(c.active, "base")}>
                <span className="truncate">{c.label}</span>
              </SidebarLink>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={expanded ? listId : undefined}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${c.title}`}
                onClick={() => setOverrides((o) => ({ ...o, [c.id]: !expanded }))}
                className={`flex min-h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/5 hover:text-white ${FOCUS_RING}`}
              >
                <ChevronIcon className={`h-4 w-4 ${reduced ? "" : "transition-transform duration-150"} ${expanded ? "" : "-rotate-90"}`} />
              </button>
            </div>
            {expanded && (
              <ul id={listId} className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                {c.projects.length === 0 && (
                  <li>
                    {isInstructor ? (
                      <p className="px-3 py-2 text-sm text-slate-400">No projects yet.</p>
                    ) : (
                      <SidebarLink href={c.href} onNavigate={onNavigate} className={viewAllClass}>Find a group</SidebarLink>
                    )}
                  </li>
                )}
                {c.projects.map((p) => (
                  <li key={p.id}>
                    <div className="flex">
                      <SidebarLink href={p.href} active={p.active} title={p.label} onNavigate={onNavigate} className={treeLinkClass(p.active, "sm")}>
                        <span className="truncate">{p.label}</span>
                      </SidebarLink>
                    </div>
                    {(p.groups.length > 0 || p.hiddenGroupCount > 0) && (
                      <ul className="ml-4 space-y-0.5 border-l border-white/10 pl-2">
                        {p.groups.map((g) => (
                          <li key={g.id} className="flex">
                            <SidebarLink href={g.href} active={g.active} onNavigate={onNavigate} className={treeLinkClass(g.active, "sm")}>
                              <span className="truncate">{g.label}</span>
                            </SidebarLink>
                          </li>
                        ))}
                        {p.hiddenGroupCount > 0 && (
                          <li>
                            <SidebarLink href={p.href} onNavigate={onNavigate} className={viewAllClass}>
                              View all groups ({p.groups.length + p.hiddenGroupCount})
                            </SidebarLink>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                ))}
                {c.hiddenProjectCount > 0 && (
                  <li>
                    <SidebarLink href={c.href} onNavigate={onNavigate} className={viewAllClass}>
                      View all projects ({c.projects.length + c.hiddenProjectCount})
                    </SidebarLink>
                  </li>
                )}
              </ul>
            )}
          </li>
        );
      })}
      {tree.hiddenClassCount > 0 && (
        <li>
          <SidebarLink href={tree.viewAllHref} onNavigate={onNavigate} className={viewAllClass}>
            View all classes ({tree.classes.length + tree.hiddenClassCount})
          </SidebarLink>
        </li>
      )}
    </ul>
  );
}

/** "Classes" / "My classes": a collapsible tree when expanded, a plain icon link in the rail. */
function ClassesSection({
  item, role, active, collapsed, onNavigate,
}: { item: NavItemDef; role: SystemRole; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(true);
  const reduced = usePrefersReducedMotion();
  if (collapsed) {
    // The tree is hidden in the rail; the icon opens the classes page.
    return <NavLinkItem item={item} active={active} collapsed onNavigate={onNavigate} />;
  }
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-classes-tree"
        onClick={() => setOpen((o) => !o)}
        className={navItemClass(active, false)}
      >
        <NavIcon name={item.icon} />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronIcon className={`h-4 w-4 ${reduced ? "" : "transition-transform duration-150"} ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div id="nav-classes-tree" className="mt-0.5">
          <ClassTree role={role} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

// ── User block ────────────────────────────────────────────────────────────────

function UserBlock({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  const { open, setOpen, ref, triggerRef } = usePopover();
  if (!user) return null;

  const role = user.systemRole;
  const avatar = (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full border text-sm font-bold ${AVATAR_STYLE[role] ?? AVATAR_STYLE.STUDENT}`}
      style={{ background: AVATAR_BG[role] ?? AVATAR_BG.STUDENT }}
    >
      {initials(user.name)}
    </span>
  );
  const badge = (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-xs font-medium ${ROLE_BADGE_DARK[role] ?? ROLE_BADGE_DARK.STUDENT}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );

  function handleLogout() { logout(); navigate("/"); setOpen(false); onNavigate?.(); }

  const itemClass = `flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white ${FOCUS_RING}`;

  return (
    <div ref={ref} className="group relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={collapsed ? `Account menu, ${user.name}, ${ROLE_LABEL[role] ?? role}` : undefined}
        onClick={() => setOpen(!open)}
        className={`flex min-h-10 w-full items-center rounded-lg py-1 hover:bg-white/5 ${collapsed ? "justify-center" : "gap-3 px-2 text-left"} ${FOCUS_RING}`}
      >
        {avatar}
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{user.name}</span>
            {badge}
          </span>
        )}
        {!collapsed && <ChevronIcon className={`h-4 w-4 shrink-0 text-slate-300 ${open ? "" : "rotate-180"}`} />}
      </button>
      {collapsed && !open && <span aria-hidden="true" className={RAIL_TOOLTIP}>{user.name} · {ROLE_LABEL[role] ?? role}</span>}

      {open && (
        <div
          role="group"
          aria-label="Account"
          className={`absolute z-50 w-60 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl shadow-black/50 ${
            collapsed ? "bottom-0 left-full ml-3" : "bottom-full left-0 mb-2"
          }`}
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="mt-0.5">{badge}</p>
          </div>
          <button type="button" onClick={handleLogout} className={itemClass}>
            <SignOutIcon /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sidebar body (shared by the desktop rail and the mobile drawer) ───────────

interface SidebarContentProps {
  collapsed: boolean;
  /** Drawer mode: always expanded, notifications is a link, shows a close button. */
  mobile?: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

export function SidebarContent({ collapsed, mobile = false, onNavigate, onToggleCollapse, onClose }: SidebarContentProps) {
  const { user } = useAuth();
  const { pathname } = useRouter();
  if (!user) return null;
  const role = user.systemRole;
  const items = getNavItems(role);

  return (
    <div className="flex h-full flex-col bg-[#020617] text-slate-300">
      {/* Logo */}
      <div className={`flex shrink-0 items-center gap-2 px-3 py-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        <SidebarLink
          href="/"
          ariaLabel="FAIR TRAZE AI home"
          onNavigate={onNavigate}
          className={`flex min-h-10 min-w-0 items-center gap-2.5 rounded-lg px-1 ${FOCUS_RING}`}
        >
          <span className="shrink-0 rounded-lg bg-white/90 px-1.5 py-1 shadow-sm">
            <img src={logoUrl} alt="" className="block h-7 w-auto" />
          </span>
          {!collapsed && (
            <span className="font-display truncate text-base font-bold leading-none tracking-tight text-white">
              FAIR <span className="text-indigo-300">TRAZE</span> AI
            </span>
          )}
        </SidebarLink>
        {mobile && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10 hover:text-white ${FOCUS_RING}`}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Navigation. Scrolls when the tree is tall; the rail keeps overflow visible so tooltips aren't clipped. */}
      <nav
        aria-label="Main"
        className={`min-h-0 flex-1 px-3 py-1 ${collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"}`}
      >
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isItemActive(role, item.key, item.href, pathname);
            return (
              <li key={item.key}>
                {item.key === "classes" ? (
                  <ClassesSection item={item} role={role} active={active} collapsed={collapsed} onNavigate={onNavigate} />
                ) : item.key === "notifications" ? (
                  mobile
                    ? <NotificationsLink item={item} active={active} onNavigate={onNavigate} />
                    : <AlertsBell collapsed={collapsed} />
                ) : (
                  <NavLinkItem item={item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer: collapse + account */}
      <div className="shrink-0 space-y-1 border-t border-white/10 px-3 py-3">
        {!mobile && onToggleCollapse && (
          <div className="group relative">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-controls={SIDEBAR_ID}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={navItemClass(false, collapsed)}
            >
              <CollapseIcon className={`h-5 w-5 ${collapsed ? "rotate-180" : ""}`} />
              {!collapsed && <span className="flex-1">Collapse</span>}
            </button>
            {collapsed && <span aria-hidden="true" className={RAIL_TOOLTIP}>Expand sidebar</span>}
          </div>
        )}
        <UserBlock collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
