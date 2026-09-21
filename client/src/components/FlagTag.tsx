import type { Flag } from "@shared/types";

// Stronger visual weight so flags immediately read as "needs attention"
// rather than blending into surrounding table text — consistent icon,
// bold border, and slightly larger type across every surface that shows flags.
const FLAG_STYLE: Record<Flag, string> = {
  inactive:          "bg-red-100 text-red-800 border-red-300",
  "free-rider":      "bg-red-100 text-red-800 border-red-300",
  overload:          "bg-orange-100 text-orange-800 border-orange-300",
  "deadline-driven": "bg-yellow-100 text-yellow-800 border-yellow-300",
};

function FlagIcon({ flag }: { flag: Flag }) {
  const cls = "w-3 h-3 shrink-0";
  switch (flag) {
    case "free-rider":
    case "overload":
      // Warning triangle
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case "deadline-driven":
      // Clock
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "inactive":
    default:
      // Dash
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
        </svg>
      );
  }
}

export function FlagTag({ flag, className = "" }: { flag: Flag; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border-2 ${FLAG_STYLE[flag]} ${className}`}
    >
      <FlagIcon flag={flag} />
      {flag}
    </span>
  );
}
