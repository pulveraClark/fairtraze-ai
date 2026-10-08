import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useAuth } from "../../context/AuthContext";
import { useRouter } from "../../router";
import { useAlerts } from "../../hooks/useAlerts";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import { readSidebarCollapsed, writeSidebarCollapsed } from "../../lib/sidebarPrefs";
import { SIDEBAR_ID, SidebarContent } from "./Sidebar";
import { MenuIcon } from "./icons";
import { FOCUS_RING } from "./navStyles";
import logoUrl from "../../assets/logo_transparent.png";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Slim bar shown below the md breakpoint: menu button + logo. */
function MobileTopBar({ open, onOpen, buttonRef }: { open: boolean; onOpen: () => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
  const { unreadCount } = useAlerts();
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#020617] px-3 md:hidden print:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Open navigation menu${unreadCount > 0 ? `, ${unreadCount} unread notifications` : ""}`}
        className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-100 hover:bg-white/10 ${FOCUS_RING}`}
      >
        <MenuIcon />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-red-500 px-1 py-0.5 text-center text-xs font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <span className="font-display truncate text-base font-bold leading-none tracking-tight text-white">
        FAIR <span className="text-indigo-300">TRAZE</span> AI
      </span>
    </header>
  );
}

function AuthedFrame({ userId, children }: { userId: number; children: ReactNode }) {
  const { pathname } = useRouter();
  const reduced = usePrefersReducedMotion();
  const [collapsed, setCollapsed] = useState(() => readSidebarCollapsed(userId));
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // A different account on the same browser has its own remembered preference.
  useEffect(() => { setCollapsed(readSidebarCollapsed(userId)); }, [userId]);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    writeSidebarCollapsed(userId, next);
  }, [collapsed, userId]);

  const closeDrawer = useCallback(() => {
    setMobileOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  // Navigating closes the drawer (focus moves with the new page, so don't steal it back).
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Widening the window past the drawer breakpoint must not leave the drawer "open" (and scroll-locked).
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(min-width: 48rem)");
    const onChange = () => { if (mql.matches) setMobileOpen(false); };
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  // Drawer behaviour: focus in, lock body scroll, Esc closes.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") closeDrawer();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen, closeDrawer]);

  // Keep Tab inside the drawer while it is open (aria-modal).
  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !drawerRef.current) return;
    const nodes = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop rail / sidebar. z-40 keeps it under modals and focus mode (z-50). */}
      <aside
        id={SIDEBAR_ID}
        aria-label="Sidebar"
        className={`sticky top-0 z-40 hidden h-screen shrink-0 border-r border-white/10 bg-[#020617] md:block print:hidden ${
          collapsed ? "w-[4.75rem]" : "w-64"
        } ${reduced ? "" : "transition-[width] duration-200"}`}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>

      <div className="ft-app-content flex min-w-0 flex-1 flex-col">
        <MobileTopBar open={mobileOpen} onOpen={() => setMobileOpen(true)} buttonRef={menuButtonRef} />
        {children}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={closeDrawer} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
            onKeyDown={trapTab}
            className={`absolute inset-y-0 left-0 w-[min(20rem,85vw)] border-r border-white/10 shadow-2xl ${reduced ? "" : "ft-drawer-in"}`}
          >
            <SidebarContent collapsed={false} mobile onNavigate={() => setMobileOpen(false)} onClose={closeDrawer} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Logged-out visitors on shared pages (/join, /overview): a compact bar instead of a sidebar. */
function PublicFrame({ children }: { children: ReactNode }) {
  const { navigate } = useRouter();
  const linkClass = `inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium ${FOCUS_RING}`;
  return (
    <div className="ft-app-content ft-app-content--public flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#020617] px-4 print:hidden">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate("/"); }}
          aria-label="FAIR TRAZE AI home"
          className={`flex min-h-10 items-center gap-2.5 rounded-lg ${FOCUS_RING}`}
        >
          <span className="rounded-lg bg-white/90 px-1.5 py-1 shadow-sm"><img src={logoUrl} alt="" className="block h-7 w-auto" /></span>
          <span className="font-display text-base font-bold leading-none tracking-tight text-white">
            FAIR <span className="text-indigo-300">TRAZE</span> AI
          </span>
        </a>
        <div className="flex items-center gap-2">
          <a href="/login" onClick={(e) => { e.preventDefault(); navigate("/login"); }} className={`${linkClass} text-slate-200 hover:bg-white/10 hover:text-white`}>Sign in</a>
          <a href="/register" onClick={(e) => { e.preventDefault(); navigate("/register"); }} className={`${linkClass} bg-indigo-600 font-semibold text-white hover:bg-indigo-500`}>Get started</a>
        </div>
      </header>
      {children}
    </div>
  );
}

/** Wraps authenticated app routes: sidebar when signed in, compact bar for signed-out visitors. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <>{children}</>;
  if (!user) return <PublicFrame>{children}</PublicFrame>;
  return <AuthedFrame userId={user.id}>{children}</AuthedFrame>;
}
