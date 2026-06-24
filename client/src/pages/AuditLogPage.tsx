import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useRouter } from "../router";
import { AppTopBar } from "../components/AppTopBar";
import { PaginationBar } from "../components/PaginationBar";

interface AuditEntry {
  id:         number;
  actorName:  string;
  action:     string;
  targetType: string;
  targetId:   string;
  details:    string | null;
  createdAt:  string;
}

interface PageMeta { total: number; page: number; pageSize: number; totalPages: number; }

const ACTION_BADGE: Record<string, string> = {
  ROLE_CHANGED:     "text-violet-700 bg-violet-50 border-violet-200",
  USER_ACTIVATED:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  USER_DEACTIVATED: "text-amber-700  bg-amber-50  border-amber-200",
  USER_DELETED:     "text-red-700    bg-red-50    border-red-200",
};

const ACTION_OPTIONS = [
  { value: "",               label: "All actions" },
  { value: "ROLE_CHANGED",   label: "Role Changed" },
  { value: "USER_ACTIVATED", label: "User Activated" },
  { value: "USER_DEACTIVATED", label: "User Deactivated" },
  { value: "USER_DELETED",   label: "User Deleted" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function AuditLogPage() {
  const { token }    = useAuth();
  const { navigate } = useRouter();

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [meta,    setMeta]    = useState<PageMeta>({ total: 0, page: 1, pageSize: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [action,  setAction]  = useState("");
  const [page,    setPage]    = useState(1);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (action) params.set("action", action);
    fetch(`/api/admin/audit?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const json = await r.json() as { entries?: AuditEntry[]; total?: number; page?: number; pageSize?: number; totalPages?: number; error?: string };
        if (!r.ok) { setError(json.error ?? "Could not load audit log."); return; }
        setEntries(json.entries ?? []);
        setMeta({ total: json.total ?? 0, page: json.page ?? 1, pageSize: json.pageSize ?? 20, totalPages: json.totalPages ?? 1 });
      })
      .catch(() => setError("Network error — could not load audit log."))
      .finally(() => setLoading(false));
  }, [token, action, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppTopBar />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 sm:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <button
                onClick={() => navigate("/admin")}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700 transition-colors font-medium"
              >
                Admin
              </button>
              <span className="text-slate-300 text-xs">›</span>
              <span className="text-xs font-semibold text-slate-800">Audit Log</span>
            </div>
            <p className="text-xs text-slate-400">
              Admin actions recorded most-recent first
              {meta.total > 0 && ` · ${meta.total} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); setPage(1); }}
              className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 cursor-pointer"
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={load}
              className="text-xs text-slate-400 hover:text-slate-700 font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8">

        {loading && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400 text-sm">
            <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
            Loading…
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button onClick={load} className="text-xs text-indigo-600 hover:underline">Retry</button>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="text-center py-20 text-sm text-slate-400">No audit log entries yet.</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Action</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actor</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden sm:table-cell">Target</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest hidden md:table-cell">Details</th>
                    <th className="px-5 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${ACTION_BADGE[e.action] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
                          {e.action.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-medium text-slate-700">{e.actorName}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className="text-xs text-slate-500">{e.targetType} #{e.targetId}</span>
                      </td>
                      <td className="px-5 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-slate-500">{e.details ?? "—"}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(e.createdAt)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 pb-4">
              <PaginationBar
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                pageSize={meta.pageSize}
                onPage={setPage}
                label="entries"
              />
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="px-6 sm:px-8 py-3">
          <p className="text-xs text-slate-400">
            Outputs support instructor judgment — they do not constitute grades or final assessments.
          </p>
        </div>
      </footer>
    </div>
  );
}
