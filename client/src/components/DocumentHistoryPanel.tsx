import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { DocBlockRenderer, type DocBlock } from "./DocBlockRenderer";

interface SnapshotListItem {
  id: number;
  createdAt: string;
  reportId: number | null;
}

interface SnapshotDetail {
  id: number;
  createdAt: string;
  reportId: number | null;
  blocks: DocBlock[];
}

interface Props {
  groupId: number;
}

// Read-only browser for a group's document revision history (DocumentSnapshot rows — see
// server/src/routes/documents.ts's GET /document/snapshots[/:snapshotId]). Entirely separate from
// DocumentEditor.tsx: this never instantiates TipTap/useEditor or connects to the Yjs
// collaboration room, so there is no live state to leave stale when switching back — it's plain
// fetch-then-render over already-tested, already-persisted JSON.
//
// Banner uses fuchsia — deliberately distinct from every color already in use nearby: amber
// (Import disclosure) and cyan (image disclosure) in MemberTable.tsx, emerald/red (toolbar
// import/export feedback) in DocumentEditor.tsx, and indigo/violet (primary/secondary brand
// accents, the latter already used for the FairTraze Docs card itself) in index.css — so this
// reads as a clearly different mode, not another flavor of the existing disclosures or branding.
export function DocumentHistoryPanel({ groupId }: Props) {
  const { token } = useAuth();
  const [snapshots, setSnapshots] = useState<SnapshotListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`/api/groups/${groupId}/document/snapshots`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ snapshots: SnapshotListItem[] }>) : Promise.reject()))
      .then((data) => {
        if (!cancelled) setSnapshots(data.snapshots);
      })
      .catch(() => {
        if (!cancelled) setListError("Could not load document history.");
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, token]);

  const openSnapshot = async (id: number) => {
    if (!token) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/document/snapshots/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as (SnapshotDetail & { error?: undefined }) | { error?: string } | null;
      if (!res.ok || !data || !("blocks" in data)) {
        setDetailError((data as { error?: string } | null)?.error ?? "Could not load this snapshot.");
        return;
      }
      setSelected(data);
    } catch {
      setDetailError("Could not load this snapshot — check your connection and try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-4 py-2.5">
          <p className="text-xs font-semibold text-fuchsia-700">
            Viewing a historical snapshot from {new Date(selected.createdAt).toLocaleString()} — read-only
          </p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs font-medium text-fuchsia-700 hover:text-fuchsia-900 underline shrink-0"
          >
            ← Back to history list
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <DocBlockRenderer blocks={selected.blocks} />
        </div>
      </div>
    );
  }

  if (snapshots === null) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">
        Loading history…
      </div>
    );
  }

  if (listError) {
    return <p className="text-xs text-red-600">{listError}</p>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-500">
          No history yet — snapshots are captured each time this group's document is analyzed.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
      {detailError && <p className="px-4 py-2 text-xs text-red-600">{detailError}</p>}
      {snapshots.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={detailLoading}
          onClick={() => openSnapshot(s.id)}
          className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <div>
            <p className="text-sm font-medium text-slate-700">{new Date(s.createdAt).toLocaleString()}</p>
            {s.reportId != null && (
              <p className="text-[11px] text-slate-400 mt-0.5">Captured from a saved analysis report</p>
            )}
          </div>
          <span className="text-xs text-indigo-600 font-medium shrink-0">View →</span>
        </button>
      ))}
    </div>
  );
}
