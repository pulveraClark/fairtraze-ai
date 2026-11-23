import { useCallback, useEffect, useRef, useState } from "react";
// Item 3 polish: "Opening…" on the clicked row, and focus that follows Retry.
import { useAuth } from "../context/AuthContext";
import { DocBlockRenderer, type DocBlock } from "./DocBlockRenderer";
import { BUTTON_SECONDARY } from "./ui/styles";
import { formatAnalyzedExact } from "../lib/analysisFreshness";
import { HISTORY_NOTE } from "../lib/docActionHints";

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

function ProblemBox({ text, onRetry, focusRetry = false }: { text: string; onRetry?: () => void; focusRetry?: boolean }) {
  const retryRef = useRef<HTMLButtonElement | null>(null);
  // After a failed Retry the old button is gone; the new one takes focus so a keyboard user is not sent back to the top.
  useEffect(() => {
    if (focusRetry) retryRef.current?.focus();
  }, [focusRetry]);
  // Never colour alone: the word "Problem", an icon and a Retry button carry the meaning too.
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8v5M12 16h.01" />
      </svg>
      <span><span className="font-semibold">Problem: </span>{text}</span>
      {onRetry && <button type="button" ref={retryRef} onClick={onRetry} className={BUTTON_SECONDARY}>Retry</button>}
    </div>
  );
}

// Read-only browser for a group's document revision history (DocumentSnapshot rows — see
// server/src/routes/documents.ts's GET /document/snapshots[/:snapshotId]). Entirely separate from
// DocumentEditor.tsx: this never instantiates TipTap/useEditor or connects to the Yjs
// collaboration room, so there is no live state to leave stale when switching back — it's plain
// fetch-then-render over already-tested, already-persisted JSON.
//
// Times are shown on the school's Asia/Manila clock (same formatter as "Last analyzed"). Banner uses
// fuchsia — deliberately distinct from the disclosure colours nearby, so it reads as a different mode.
export function DocumentHistoryPanel({ groupId }: Props) {
  const { token } = useAuth();
  const [snapshots, setSnapshots] = useState<SnapshotListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastOpenedId, setLastOpenedId] = useState<number | null>(null);
  const versionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());
  const loadingRef = useRef<HTMLDivElement | null>(null);
  // True after the user pressed Retry: focus follows the screen (loading line, then the first row or the new error).
  const [retried, setRetried] = useState(false);
  const openingId = detailLoading ? lastOpenedId : null;
  const firstRowId = snapshots?.[0]?.id;
  useEffect(() => {
    if (!retried) return;
    if (snapshots === null && !listError) loadingRef.current?.focus();
    else if (snapshots && snapshots.length > 0 && firstRowId != null) {
      rowRefs.current.get(firstRowId)?.focus();
      setRetried(false);
    } else if (snapshots) setRetried(false);
  }, [retried, snapshots, listError, firstRowId]);

  const loadList = useCallback(() => {
    if (!token) return () => {};
    let cancelled = false;
    setListError(null);
    setSnapshots(null);
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

  useEffect(() => loadList(), [loadList]);

  // Focus follows the screen: opening a version moves focus to its heading, going back returns it to
  // the row that was opened.
  useEffect(() => {
    if (selected) versionHeadingRef.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (!selected && snapshots && lastOpenedId != null) rowRefs.current.get(lastOpenedId)?.focus();
  }, [selected, snapshots, lastOpenedId]);

  const openSnapshot = async (id: number) => {
    if (!token) return;
    setDetailLoading(true);
    setDetailError(null);
    setLastOpenedId(id);
    try {
      const res = await fetch(`/api/groups/${groupId}/document/snapshots/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => null)) as (SnapshotDetail & { error?: undefined }) | { error?: string } | null;
      if (!res.ok || !data || !("blocks" in data)) {
        setDetailError((data as { error?: string } | null)?.error ?? "Could not load this version.");
        return;
      }
      setSelected(data);
    } catch {
      setDetailError("Could not load this version. Check your connection and try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  if (selected) {
    const when = formatAnalyzedExact(selected.createdAt);
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-fuchsia-300 bg-fuchsia-50 px-4 py-2.5">
          <h3 ref={versionHeadingRef} tabIndex={-1} className="text-sm font-semibold text-fuchsia-900 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
            Version saved {when} (Manila time), read-only
          </h3>
          <button type="button" onClick={() => setSelected(null)} className={`${BUTTON_SECONDARY} shrink-0`}>
            ← Back to history list
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
          <DocBlockRenderer blocks={selected.blocks} />
        </div>
      </div>
    );
  }

  if (listError) {
    return <ProblemBox text={listError} onRetry={() => { setRetried(true); loadList(); }} focusRetry={retried} />;
  }

  if (snapshots === null) {
    return (
      <div ref={loadingRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-700">
        Loading history…
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm text-slate-700">
          No history yet. A version is saved each time this group's document is analyzed and has changed.
        </p>
        <p className="mt-2 text-sm text-slate-700">{HISTORY_NOTE}</p>
      </div>
    );
  }

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">{detailLoading ? "Opening version…" : ""}</div>
      {detailError && <div className="mb-3"><ProblemBox text={detailError} /></div>}
      <ul className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
        {snapshots.map((s) => {
          const when = formatAnalyzedExact(s.createdAt);
          return (
            <li key={s.id}>
              <button
                type="button"
                ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
                disabled={detailLoading}
                aria-label={`Open the version saved ${when}`}
                aria-busy={openingId === s.id}
                onClick={() => openSnapshot(s.id)}
                className="flex min-h-10 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-600"
              >
                <span>
                  <span className="block text-sm font-medium text-slate-900">{when}</span>
                  {s.reportId != null && <span className="mt-0.5 block text-xs text-slate-700">Saved with an analysis</span>}
                </span>
                <span className="shrink-0 text-sm font-medium text-indigo-800" aria-hidden="true">{openingId === s.id ? "Opening…" : "View →"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-slate-700">{HISTORY_NOTE}</p>
    </div>
  );
}
