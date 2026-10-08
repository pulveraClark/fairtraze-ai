import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../lib/apiBase";
import { BriefEditor } from "./BriefEditor";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS_LIGHT } from "./ui/styles";
import { useFocusTrap } from "./ui/useFocusTrap";
import {
  draftFromAttachments, emptyDraft, retryUploads, syncBrief,
  type BriefAttachment, type BriefDraft, type DraftItem,
} from "../lib/briefAttachments";

const INPUT = `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ${FOCUS_LIGHT}`;

interface AssignmentDetail {
  id: number;
  title: string;
  deadline: string | null;
  maxGroupSize: number;
  description: string | null;
  attachments: BriefAttachment[];
}

const toDateInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Shown when the project was saved but some attachment uploads failed. */
export function UploadFailurePanel({
  failed, retrying, onRetry, onEdit, onDone, editLabel = "Edit project",
}: {
  failed: DraftItem[]; retrying: boolean; onRetry: () => void; onEdit?: () => void; onDone: () => void; editLabel?: string;
}) {
  return (
    <div className="space-y-3 px-6 py-5">
      <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
        <p className="font-semibold">
          Saved, but {failed.length} file{failed.length === 1 ? "" : "s"} didn&apos;t upload.
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          {failed.map((f) => (
            <li key={f.key} className="break-words">
              {f.name}{f.error ? ` — ${f.error}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={BUTTON_SECONDARY} onClick={onDone}>Skip these</button>
        {onEdit && <button type="button" className={BUTTON_SECONDARY} onClick={onEdit}>{editLabel}</button>}
        <button type="button" className={BUTTON_PRIMARY} disabled={retrying} onClick={onRetry}>
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    </div>
  );
}

export function EditAssignmentModal({
  assignmentId, token, onClose, onSaved,
}: { assignmentId: number; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState<AssignmentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [maxGroupSize, setMaxGroupSize] = useState("5");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<BriefDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<DraftItem[] | null>(null);
  const [retrying, setRetrying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref, onClose);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/assignments/${assignmentId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = (await res.json()) as { assignment?: AssignmentDetail; error?: string };
        if (!res.ok || !data.assignment) throw new Error(data.error ?? "Could not load this project.");
        if (cancelled) return;
        const a = data.assignment;
        setLoaded(a);
        setTitle(a.title);
        setDeadline(toDateInput(a.deadline));
        setMaxGroupSize(String(a.maxGroupSize));
        setDescription(a.description ?? "");
        setDraft(draftFromAttachments(a.attachments));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load this project.");
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId, token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!loaded || !title.trim() || !deadline) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        maxGroupSize: parseInt(maxGroupSize) || loaded.maxGroupSize,
        description,
      };
      if (deadline !== toDateInput(loaded.deadline)) body.deadline = new Date(deadline + "T00:00:00").toISOString();
      const res = await fetch(`${API_BASE_URL}/api/assignments/${assignmentId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not save changes.");
        return;
      }
      const { failed: bad } = await syncBrief(assignmentId, draft, token ?? "");
      onSaved();
      if (bad.length === 0) { onClose(); return; }
      await rebuildDraftAfterPartial(bad);
      setFailed(bad);
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setSaving(false);
    }
  }

  // After a partial upload, the files that did succeed are stored now: rebuild the draft from the
  // server and re-append only the failed ones, so "Back to editing" never re-uploads duplicates.
  async function rebuildDraftAfterPartial(bad: DraftItem[]) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/assignments/${assignmentId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = (await res.json()) as { assignment?: AssignmentDetail };
      if (!res.ok || !data.assignment) return;
      const fresh = draftFromAttachments(data.assignment.attachments);
      const failedPdf = bad.find((f) => f === draft.pdf) ?? null;
      setLoaded(data.assignment);
      setDraft({
        images: [...fresh.images, ...bad.filter((f) => f !== failedPdf)],
        pdf: fresh.pdf ?? failedPdf,
        removedIds: [],
      });
    } catch { /* keep the current draft */ }
  }

  async function handleRetry() {
    if (!failed) return;
    setRetrying(true);
    const { failed: still } = await retryUploads(assignmentId, failed, token ?? "");
    setRetrying(false);
    onSaved();
    if (still.length === 0) { onClose(); return; }
    await rebuildDraftAfterPartial(still);
    setFailed(still);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="edit-project-title" className="text-sm font-semibold text-slate-900">Edit project</h2>
          <button type="button" onClick={onClose} className={`rounded p-1 text-slate-600 hover:text-slate-900 ${FOCUS_LIGHT}`} aria-label="Close">✕</button>
        </div>

        {failed ? (
          <UploadFailurePanel
            failed={failed}
            retrying={retrying}
            onRetry={() => void handleRetry()}
            onEdit={() => setFailed(null)}
            editLabel="Back to editing"
            onDone={onClose}
          />
        ) : loadError ? (
          <p role="alert" className="px-6 py-5 text-sm text-red-700">{loadError}</p>
        ) : !loaded ? (
          <p className="px-6 py-5 text-sm text-slate-600">Loading…</p>
        ) : (
          <form onSubmit={(e) => void handleSave(e)}>
            <div className="space-y-4 px-6 py-5">
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">{error}</div>}
              <div>
                <label htmlFor="edit-title" className="mb-1.5 block text-xs font-medium text-slate-700">Project title</label>
                <input id="edit-title" required value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="edit-deadline" className="mb-1.5 block text-xs font-medium text-slate-700">Deadline</label>
                  <input id="edit-deadline" required type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label htmlFor="edit-size" className="mb-1.5 block text-xs font-medium text-slate-700">Max group size</label>
                  <input id="edit-size" type="number" min={1} max={20} value={maxGroupSize} onChange={(e) => setMaxGroupSize(e.target.value)} className={INPUT} />
                </div>
              </div>
              <BriefEditor
                assignmentId={assignmentId}
                description={description}
                onDescriptionChange={setDescription}
                draft={draft}
                onDraftChange={setDraft}
                disabled={saving}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button type="button" className={BUTTON_SECONDARY} onClick={onClose}>Cancel</button>
              <button type="submit" className={BUTTON_PRIMARY} disabled={saving || !title.trim() || !deadline}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
