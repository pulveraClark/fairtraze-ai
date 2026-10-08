import { useState } from "react";
import { useAlerts, alertMeta, alertLink, timeAgo } from "../hooks/useAlerts";
import type { AlertItem } from "../hooks/useAlerts";
import { usePopover } from "../hooks/usePopover";
import { useRouter } from "../router";
import { NavIcon } from "./layout/icons";
import { FOCUS_RING, RAIL_TOOLTIP, navItemClass } from "./layout/navStyles";

const PREVIEW_COUNT = 6;
// Rough flyout height (header + 22rem list + footer) used only to keep it on screen.
const FLYOUT_ESTIMATE_PX = 480;

interface AlertsBellProps {
  /** Icon-rail mode: no label, a red dot instead of the count, and a tooltip. */
  collapsed?: boolean;
}

/**
 * Sidebar "Notifications" item (desktop). Shows the unread count and opens the alerts
 * preview as a flyout beside the sidebar. The flyout is `fixed` because the expanded
 * nav area scrolls and would clip an absolutely-positioned child.
 */
export function AlertsBell({ collapsed = false }: AlertsBellProps) {
  const { navigate, pathname } = useRouter();
  const { open, setOpen, ref, triggerRef } = usePopover();
  const [pos, setPos] = useState({ left: 0, top: 0 });
  // Full list is only fetched while the flyout is open; the badge polls the count alone.
  const { alerts, unreadCount, loading, markRead, markAllRead } = useAlerts({ listEnabled: open });

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const maxTop = Math.max(8, window.innerHeight - FLYOUT_ESTIMATE_PX - 8);
      setPos({ left: rect.right + 8, top: Math.max(8, Math.min(rect.top, maxTop)) });
    }
    setOpen(!open);
  }

  async function handleAlertClick(alert: AlertItem) {
    setOpen(false);
    if (!alert.read) await markRead(alert.id);
    const link = alertLink(alert);
    if (!link) return;
    // Same page, different query (e.g. ?manage=1): pathname-driven routing wouldn't
    // re-mount the page, so reload so the page reads the new query.
    if (link.split("?")[0] === pathname) window.location.assign(link);
    else navigate(link);
  }

  const preview = alerts.slice(0, PREVIEW_COUNT);
  const hasMore = alerts.length > PREVIEW_COUNT;
  const countText = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={ref} className="group relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        className={navItemClass(open, collapsed)}
      >
        <span className="relative flex shrink-0">
          <NavIcon name="bell" />
          {collapsed && unreadCount > 0 && (
            <span aria-hidden="true" className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[#020617]" />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">Notifications</span>
            {unreadCount > 0 && (
              <span aria-hidden="true" className="min-w-[1.5rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[0.8125rem] font-bold leading-none text-white">
                {countText}
              </span>
            )}
          </>
        )}
      </button>
      {collapsed && !open && (
        <span aria-hidden="true" className={RAIL_TOOLTIP}>
          Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ""}
        </span>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{ left: pos.left, top: pos.top, maxHeight: "calc(100vh - 1rem)" }}
          className="fixed z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900 shadow-xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-800/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full border border-red-500/40 bg-red-500/20 px-2 py-0.5 text-[0.8125rem] font-bold text-red-300">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className={`min-h-11 rounded-md px-2 text-sm font-medium text-indigo-300 hover:text-indigo-200 ${FOCUS_RING}`}
              >
                Mark all as read
              </button>
            )}
          </div>

          {alerts.length === 0 && loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Loading…</p>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-base font-medium text-slate-200">No notifications</p>
              <p className="text-sm text-slate-400">You're all caught up</p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 divide-y divide-slate-800/60 overflow-y-auto">
                {preview.map((alert) => {
                  const meta = alertMeta(alert.type);
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => handleAlertClick(alert)}
                      className={`min-h-11 w-full px-4 py-3 text-left hover:bg-white/5 ${FOCUS_RING} ${!alert.read ? "bg-indigo-500/10" : ""}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${!alert.read ? "bg-indigo-300" : "bg-transparent"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <span className={`mb-1 inline-block rounded border px-1.5 py-0.5 text-[0.8125rem] font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                          {!alert.read && <span className="sr-only"> (unread)</span>}
                          <p className={`break-words text-sm leading-snug ${!alert.read ? "font-semibold text-slate-100" : "text-slate-300"}`}>
                            {alert.message}
                          </p>
                          <p className="mt-1 text-[0.8125rem] text-slate-400">{timeAgo(alert.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-800 bg-slate-900/50 px-4 py-1">
                <button
                  type="button"
                  onClick={() => { navigate("/alerts"); setOpen(false); }}
                  className={`min-h-11 w-full rounded-md text-center text-sm font-medium text-indigo-300 hover:text-indigo-200 ${FOCUS_RING}`}
                >
                  {hasMore ? `View all ${alerts.length} notifications →` : "View all notifications →"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
