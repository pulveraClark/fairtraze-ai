import { useState } from "react";
import { useRouter } from "../router";
import type { AppRoute } from "../router";
import { useAuth } from "../context/AuthContext";
import { AlertsBell } from "./AlertsBell";
import { UserMenu } from "./UserMenu";

const DASHBOARD_ITEM = { label: "Dashboard",       route: "/dashboard" as AppRoute };
const ADMIN_ITEM     = { label: "Admin Dashboard", route: "/admin"     as AppRoute };

const ROLE_LABEL: Record<string, string> = {
  INSTRUCTOR: "Instructor",
  ADMIN:      "Admin",
  STUDENT:    "Student",
};

const AVATAR_STYLE: Record<string, string> = {
  INSTRUCTOR: "border-indigo-400 text-indigo-300",
  ADMIN:      "border-indigo-400 text-indigo-300",
  STUDENT:    "border-indigo-500 text-indigo-400",
};

const AVATAR_BG: Record<string, string> = {
  INSTRUCTOR: "rgba(99,102,241,0.15)",
  ADMIN:      "rgba(99,102,241,0.15)",
  STUDENT:    "rgba(99,102,241,0.1)",
};

const ROLE_BADGE: Record<string, string> = {
  INSTRUCTOR: "text-indigo-300 border-indigo-500/50 bg-indigo-500/10",
  ADMIN:      "text-indigo-300 border-indigo-500/50 bg-indigo-500/10",
  STUDENT:    "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
};

function initials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function isActive(pathname: string, route: AppRoute): boolean {
  if (pathname === route) return true;
  if (route === "/dashboard" && (pathname.startsWith("/project/") || pathname.startsWith("/class/"))) return true;
  return false;
}

export function AppTopBar() {
  const { pathname, navigate } = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { label: string; route: AppRoute }[] = [];
  if (user?.systemRole === "INSTRUCTOR") navItems.push(DASHBOARD_ITEM);
  if (user?.systemRole === "ADMIN")      navItems.push(ADMIN_ITEM);

  function go(route: string) {
    navigate(route);
    setMobileOpen(false);
  }

  function handleLogout() {
    logout();
    navigate("/");
    setMobileOpen(false);
  }

  const avatarStyle = user ? (AVATAR_STYLE[user.systemRole] ?? AVATAR_STYLE.STUDENT) : "";
  const avatarBg    = user ? (AVATAR_BG[user.systemRole]    ?? AVATAR_BG.STUDENT)    : "";
  const roleBadge   = user ? (ROLE_BADGE[user.systemRole]   ?? ROLE_BADGE.STUDENT)   : "";

  return (
    <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-md border-b border-white/5">
      {/* ── Main bar ── */}
      <div className="max-w-screen-2xl mx-auto px-5 sm:px-8 h-16 flex items-center gap-4 sm:gap-6">

        {/* Wordmark */}
        <button
          onClick={() => go("/")}
          className="shrink-0 flex items-center gap-2.5 group"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
            style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)" }}
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6" />
            </svg>
          </div>
          <span className="font-display font-bold text-base tracking-tight text-white leading-none">
            FAIR <span className="text-indigo-500">TRAZE</span> AI
          </span>
          <span className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-medium ml-1">
            <span className="w-px h-3 bg-slate-700 block" />
            Contribution Fairness
          </span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map(({ label, route }) => {
            const active = isActive(pathname, route);
            return (
              <button
                key={route}
                onClick={() => go(route)}
                className={`px-3.5 py-2 rounded-lg text-sm transition-all ${
                  active
                    ? "text-white font-semibold bg-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5 font-medium"
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-3">

          {/* ── Desktop: user menu or auth buttons ── */}
          {!authLoading && (
            <div className="hidden sm:flex items-center gap-2">
              {user ? (
                <>
                  {user.systemRole === "INSTRUCTOR" && <AlertsBell />}
                  <UserMenu theme="dark" />
                </>
              ) : (
                <>
                  <button
                    onClick={() => go("/login")}
                    className="text-sm text-slate-300 hover:text-white transition-colors font-medium px-4 py-2 rounded-lg hover:bg-white/5"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={() => go("/register")}
                    className="text-sm font-semibold px-4 py-2 rounded-lg text-white shadow-sm hover:shadow-indigo-500/25 transition-all"
                    style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)" }}
                  >
                    Get Started
                  </button>
                </>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle navigation menu"
            className="sm:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown ── */}
      {mobileOpen && (
        <div className="sm:hidden border-t border-slate-800 px-5 pb-5 pt-3 space-y-1 bg-slate-900">
          {navItems.map(({ label, route }) => {
            const active = isActive(pathname, route);
            return (
              <button
                key={route}
                onClick={() => go(route)}
                className={`w-full flex items-center text-left px-4 py-3 rounded-xl text-sm transition-all ${
                  active
                    ? "text-white font-semibold bg-white/10"
                    : "text-slate-300 hover:text-white hover:bg-white/5 font-medium"
                }`}
              >
                {label}
              </button>
            );
          })}

          <div className="pt-3 mt-2 border-t border-slate-800">
            {!authLoading && user ? (
              <div className="space-y-1">
                {/* Mobile user header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`w-10 h-10 rounded-full border flex items-center justify-center text-sm font-bold shrink-0 select-none ${avatarStyle}`}
                    style={{ background: avatarBg }}
                  >
                    {initials(user.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                    <span className={`inline-block text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md border mt-1 ${roleBadge}`}>
                      {ROLE_LABEL[user.systemRole] ?? user.systemRole}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => go("/settings")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors font-medium"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => go("/login")}
                  className="w-full text-center py-3 rounded-xl text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-all font-medium border border-slate-700"
                >
                  Sign in
                </button>
                <button
                  onClick={() => go("/register")}
                  className="w-full text-center py-3 rounded-xl text-sm font-semibold text-white shadow-sm"
                  style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)" }}
                >
                  Get Started
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
