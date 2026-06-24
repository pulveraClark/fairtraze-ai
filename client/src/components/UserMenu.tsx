import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";

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

// Role badge: dark theme uses translucent; light theme uses solid for readability on white
const ROLE_BADGE_DARK: Record<string, string> = {
  INSTRUCTOR: "text-indigo-300 border-indigo-500/50 bg-indigo-500/10",
  ADMIN:      "text-indigo-300 border-indigo-500/50 bg-indigo-500/10",
  STUDENT:    "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
};

const ROLE_BADGE_LIGHT: Record<string, string> = {
  INSTRUCTOR: "text-indigo-700 border-indigo-200 bg-indigo-50",
  ADMIN:      "text-indigo-700 border-indigo-200 bg-indigo-50",
  STUDENT:    "text-indigo-600 border-indigo-100 bg-indigo-50/70",
};

function initials(name: string): string {
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

interface Styles {
  trigger:    string;
  nameText:   string;
  caret:      string;
  dropdown:   string;
  header:     string;
  nameTitle:  string;
  item:       string;
  icon:       string;
  divider:    string;
  signOut:    string;
}

const DARK: Styles = {
  trigger:   "flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/5 transition-colors group",
  nameText:  "text-sm text-slate-300 max-w-[8rem] truncate font-medium group-hover:text-white transition-colors",
  caret:     "w-3.5 h-3.5 text-slate-500 transition-transform duration-150",
  dropdown:  "absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-700/60 shadow-xl shadow-black/50 overflow-hidden bg-slate-900/95 backdrop-blur-xl",
  header:    "px-5 py-4 border-b border-slate-800 bg-slate-800/50",
  nameTitle: "text-sm font-semibold text-white truncate",
  item:      "w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left font-medium",
  icon:      "w-4 h-4 text-slate-400",
  divider:   "border-t border-slate-800 py-1.5",
  signOut:   "w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left font-medium",
};

const LIGHT: Styles = {
  trigger:   "flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-colors group",
  nameText:  "text-sm text-slate-700 max-w-[8rem] truncate font-medium group-hover:text-slate-900 transition-colors",
  caret:     "w-3.5 h-3.5 text-slate-400 transition-transform duration-150",
  dropdown:  "absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/60 overflow-hidden bg-white",
  header:    "px-5 py-4 border-b border-slate-100 bg-slate-50",
  nameTitle: "text-sm font-semibold text-slate-900 truncate",
  item:      "w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors text-left font-medium",
  icon:      "w-4 h-4 text-slate-400",
  divider:   "border-t border-slate-100 py-1.5",
  signOut:   "w-full flex items-center gap-3 px-5 py-2.5 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors text-left font-medium",
};

interface UserMenuProps {
  theme?: "dark" | "light";
}

export function UserMenu({ theme = "dark" }: UserMenuProps) {
  const { user, logout } = useAuth();
  const { navigate }     = useRouter();
  const [open, setOpen]  = useState(false);
  const ref              = useRef<HTMLDivElement>(null);
  const s                = theme === "light" ? LIGHT : DARK;
  const roleBadge        = theme === "light" ? ROLE_BADGE_LIGHT : ROLE_BADGE_DARK;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown",   onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown",   onKey);
    };
  }, [open]);

  if (!user) return null;

  const avatarStyle = AVATAR_STYLE[user.systemRole] ?? AVATAR_STYLE.STUDENT;
  const avatarBg    = AVATAR_BG[user.systemRole]    ?? AVATAR_BG.STUDENT;
  const badge       = roleBadge[user.systemRole]    ?? roleBadge.STUDENT;

  function go(path: string) { navigate(path); setOpen(false); }
  function handleLogout()    { logout(); navigate("/"); setOpen(false); }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={s.trigger}
      >
        <span
          className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 select-none ${avatarStyle}`}
          style={{ background: avatarBg }}
        >
          {initials(user.name)}
        </span>
        <span className={s.nameText}>{user.name}</span>
        <svg
          className={`${s.caret} ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div role="menu" className={s.dropdown}>
          {/* Header */}
          <div className={s.header}>
            <div className="flex items-center gap-3">
              <span
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold shrink-0 select-none ${avatarStyle}`}
                style={{ background: avatarBg }}
              >
                {initials(user.name)}
              </span>
              <div className="min-w-0">
                <p className={s.nameTitle}>{user.name}</p>
                <span className={`inline-block text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-md border mt-1 ${badge}`}>
                  {ROLE_LABEL[user.systemRole] ?? user.systemRole}
                </span>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="py-1.5">
            <button role="menuitem" onClick={() => go("/settings")} className={s.item}>
              <svg className={s.icon} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </button>
          </div>

          {/* Sign out */}
          <div className={s.divider}>
            <button role="menuitem" onClick={handleLogout} className={s.signOut}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
