import { useState, useRef, useEffect } from "react";
import { useAlerts, ALERT_TYPE_META, timeAgo } from "../hooks/useAlerts";
import type { AlertItem } from "../hooks/useAlerts";
import { useRouter } from "../router";

const PREVIEW_COUNT = 6;

export function AlertsBell() {
  const { alerts, unreadCount, markRead, markAllRead } = useAlerts();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside-click or Escape
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

  async function handleAlertClick(alert: AlertItem) {
    setOpen(false);
    if (!alert.read) await markRead(alert.id);
    navigate(`/project/${alert.projectId}`);
  }

  const preview  = alerts.slice(0, PREVIEW_COUNT);
  const hasMore  = alerts.length > PREVIEW_COUNT;

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Alerts${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none select-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Alerts"
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-slate-700/60 shadow-xl shadow-black/50 overflow-hidden bg-slate-900/95 backdrop-blur-xl z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Alerts</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Empty state */}
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-1">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-300">No alerts</p>
              <p className="text-xs text-slate-500">All your groups look healthy</p>
            </div>
          ) : (
            <>
              {/* Alert list */}
              <div className="max-h-[22rem] overflow-y-auto divide-y divide-slate-800/60">
                {preview.map((alert) => {
                  const meta = ALERT_TYPE_META[alert.type];
                  return (
                    <button
                      key={alert.id}
                      onClick={() => handleAlertClick(alert)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/5 transition-colors ${
                        !alert.read ? "bg-indigo-500/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Unread dot */}
                        <span
                          className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                            !alert.read ? "bg-indigo-400" : "bg-transparent"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${meta.color}`}>
                              {meta.label}
                            </span>
                          </div>
                          <p className={`text-xs leading-snug break-words ${
                            !alert.read ? "text-slate-200 font-semibold" : "text-slate-400"
                          }`}>
                            {alert.message}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-1">{timeAgo(alert.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Footer: View all */}
              <div className="border-t border-slate-800 px-4 py-2.5 bg-slate-900/50">
                <button
                  onClick={() => { navigate("/alerts"); setOpen(false); }}
                  className="w-full text-xs text-indigo-400 hover:text-indigo-300 font-medium text-center transition-colors py-0.5"
                >
                  {hasMore
                    ? `View all ${alerts.length} alerts →`
                    : "View all alerts →"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
