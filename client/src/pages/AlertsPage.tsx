import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { PaginationBar } from "../components/PaginationBar";
import { timeAgo } from "../hooks/useAlerts";
import type { AlertItem } from "../hooks/useAlerts";

interface PageMeta { total: number; page: number; pageSize: number; totalPages: number; }

const ALERT_TYPE_LIGHT: Record<AlertItem["type"], { label: string; color: string; navigateTo: "project" | "disputes" }> = {
  HIGH_RISK:      { label: "High Risk",       color: "text-red-700 bg-red-50 border-red-200",         navigateTo: "project" },
  MODERATE_RISK:  { label: "Moderate Risk",   color: "text-amber-700 bg-amber-50 border-amber-200",   navigateTo: "project" },
  MEMBER_FLAGGED: { label: "Members Flagged", color: "text-orange-700 bg-orange-50 border-orange-200", navigateTo: "project" },
  DISPUTE_FILED:  { label: "Dispute",         color: "text-violet-700 bg-violet-50 border-violet-200", navigateTo: "disputes" },
};

export function AlertsPage() {
  const { token }    = useAuth();
  const { navigate } = useRouter();

  const [alerts,      setAlerts]  = useState<AlertItem[]>([]);
  const [unreadCount, setUnread]  = useState(0);
  const [meta,        setMeta]    = useState<PageMeta>({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [page,        setPage]    = useState(1);
  const [loading,     setLoading] = useState(true);
  const [error,       setError]   = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    fetch(`/api/alerts?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as {
          alerts?: AlertItem[];
          unreadCount?: number;
          total?: number;
          page?: number;
          pageSize?: number;
          totalPages?: number;
          error?: string;
        };
        if (!r.ok) { setError(json.error ?? "Could not load alerts."); return; }
        setAlerts(json.alerts ?? []);
        setUnread(json.unreadCount ?? 0);
        setMeta({
          total:      json.total      ?? 0,
          page:       json.page       ?? 1,
          pageSize:   json.pageSize   ?? 20,
          totalPages: json.totalPages ?? 1,
        });
      })
      .catch(() => setError("Network error — could not load alerts."))
      .finally(() => setLoading(false));
  }, [token, page]);

  useEffect(() => { load(); }, [load]);

  async function handleClick(alert: AlertItem) {
    if (!alert.read && token) {
      await fetch(`/api/alerts/${alert.id}/read`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a)));
      setUnread((prev) => Math.max(0, prev - 1));
    }
    const typeMeta = ALERT_TYPE_LIGHT[alert.type];
    navigate(typeMeta.navigateTo === "disputes" ? "/disputes" : `/project/${alert.projectId}`);
  }

  async function handleMarkAllRead() {
    if (!token) return;
    await fetch("/api/alerts/read-all", {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    setUnread(0);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <button
                onClick={() => navigate("/dashboard")}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
              >
                Dashboard
              </button>
              <span className="text-slate-300 text-xs shrink-0">›</span>
              <span className="shrink-0 text-xs font-semibold text-slate-800">Alerts</span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-semibold">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Team health alerts and flag notifications
              {meta.total > 0 && ` · ${meta.total} total`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
            <button
              onClick={load}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 sm:px-8 py-8">

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
            <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            Loading…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button onClick={load} className="text-xs text-indigo-600 hover:underline">Retry</button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && alerts.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">No alerts</p>
            <p className="text-sm text-slate-400">All your groups look healthy</p>
          </div>
        )}

        {/* Alert list */}
        {!loading && !error && alerts.length > 0 && (
          <>
            <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white shadow-sm">
              {alerts.map((alert, i) => {
                const typeMeta = ALERT_TYPE_LIGHT[alert.type];
                const stripe   = i % 2 === 0 ? "bg-white" : "bg-gray-50";
                return (
                  <button
                    key={alert.id}
                    onClick={() => handleClick(alert)}
                    className={`w-full text-left px-5 py-4 transition-colors hover:bg-slate-100 ${
                      !alert.read ? "bg-indigo-50/60" : stripe
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-[9px] w-2 h-2 rounded-full shrink-0 ${!alert.read ? "bg-indigo-500" : "bg-transparent border border-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${typeMeta.color}`}>
                            {typeMeta.label}
                          </span>
                          <span className="text-xs text-slate-400">{timeAgo(alert.createdAt)}</span>
                        </div>
                        <p className={`text-sm leading-snug ${!alert.read ? "text-slate-800 font-semibold" : "text-slate-600"}`}>
                          {alert.message}
                        </p>
                        {alert.project.groupName && (
                          <p className="text-xs text-slate-400 mt-1 truncate">
                            {alert.project.groupName}
                            {alert.project.assignmentLabel ? ` · ${alert.project.assignmentLabel}` : ""}
                          </p>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              <PaginationBar
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                pageSize={meta.pageSize}
                onPage={setPage}
                label="alerts"
              />
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-400">
            Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.
          </p>
          <button onClick={() => navigate("/overview")} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            System Overview →
          </button>
        </div>
      </footer>
    </div>
  );
}
