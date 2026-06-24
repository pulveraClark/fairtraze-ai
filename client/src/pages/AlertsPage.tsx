import { useAlerts, ALERT_TYPE_META, timeAgo } from "../hooks/useAlerts";
import type { AlertItem } from "../hooks/useAlerts";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";

export function AlertsPage() {
  const { alerts, unreadCount, loading, markRead, markAllRead } = useAlerts();
  const { navigate } = useRouter();

  async function handleClick(alert: AlertItem) {
    if (!alert.read) await markRead(alert.id);
    const meta = ALERT_TYPE_META[alert.type];
    navigate(meta.navigateTo === "disputes" ? "/disputes" : `/project/${alert.projectId}`);
  }

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <AppTopBar />

      <main className="max-w-2xl mx-auto px-5 sm:px-8 py-10">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Alerts</h1>
            {unreadCount > 0 && (
              <p className="text-sm text-slate-400 mt-0.5">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-indigo-500/10"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && alerts.length === 0 && (
          <div className="text-center py-20 text-slate-500 text-sm">Loading…</div>
        )}

        {/* Empty state */}
        {!loading && alerts.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-emerald-400"
                fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.8}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-300">No alerts</p>
            <p className="text-sm text-slate-500">All your groups look healthy</p>
          </div>
        )}

        {/* Alert list */}
        {alerts.length > 0 && (
          <div className="rounded-2xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
            {alerts.map((alert) => {
              const meta = ALERT_TYPE_META[alert.type];
              return (
                <button
                  key={alert.id}
                  onClick={() => handleClick(alert)}
                  className={`w-full text-left px-5 py-4 transition-colors hover:bg-white/5 ${
                    !alert.read ? "bg-indigo-500/5" : "bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Unread indicator */}
                    <span
                      className={`mt-[9px] w-2 h-2 rounded-full shrink-0 ${
                        !alert.read ? "bg-indigo-400" : "bg-transparent"
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-slate-500">{timeAgo(alert.createdAt)}</span>
                      </div>

                      <p className={`text-sm leading-snug ${
                        !alert.read ? "text-slate-100 font-semibold" : "text-slate-400"
                      }`}>
                        {alert.message}
                      </p>

                      {alert.project.groupName && (
                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {alert.project.groupName}
                          {alert.project.assignmentLabel
                            ? ` · ${alert.project.assignmentLabel}`
                            : ""}
                        </p>
                      )}
                    </div>

                    {/* Chevron */}
                    <svg
                      className="w-4 h-4 text-slate-600 shrink-0 mt-1"
                      fill="none" viewBox="0 0 24 24"
                      stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
