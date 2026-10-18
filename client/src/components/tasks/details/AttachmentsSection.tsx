import { useEffect, useRef, useState } from "react";
import { TASK_LIMITS, type BoardTask, type TaskAttachmentMeta, type TaskDetails } from "@shared/taskTypes";
import { useAuth } from "../../../context/AuthContext";
import { taskApi } from "../../../lib/tasks/api";
import { isAcceptedBriefImage, isAcceptedBriefPdf, prepareBriefImage } from "../../../lib/briefImage";
import { BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "../../ui/styles";
import { CloseIcon, PlusIcon } from "../icons";

interface Props {
  task: BoardTask;
  attachments: TaskAttachmentMeta[];
  storage: TaskDetails["storage"];
  /** Why uploads and removal are locked (tooltip), or null when the viewer may edit. */
  lockedReason: string | null;
  onUpload: (file: Blob, filename: string) => Promise<unknown>;
  onRemove: (id: number) => Promise<unknown>;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fetches an attachment with the sign-in token (the files are private) and returns a blob URL. */
function useAttachmentUrl(projectId: number, taskId: number, att: TaskAttachmentMeta, enabled: boolean) {
  const { token } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !token) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(taskApi.attachmentUrl(projectId, taskId, att.id), { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("unavailable"))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, taskId, att.id, enabled, token]);
  return url;
}

function AttachmentRow({ task, att, locked, onRemove }: { task: BoardTask; att: TaskAttachmentMeta; locked: boolean; onRemove: () => void }) {
  const { token } = useAuth();
  const thumb = useAttachmentUrl(task.projectId, task.id, att, att.kind === "IMAGE");

  async function open() {
    // Open in a new tab. The file needs the token, so fetch it and open the blob.
    const res = await fetch(taskApi.attachmentUrl(task.projectId, task.id, att.id), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(new Blob([blob], { type: att.mime }));
    window.open(href, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }

  return (
    <li className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
      {att.kind === "IMAGE" && thumb ? (
        <img src={thumb} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-semibold text-slate-800">
          {att.kind === "PDF" ? "PDF" : "IMG"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <button type="button" onClick={() => void open()} className={`block max-w-full truncate rounded text-left text-sm font-medium text-indigo-900 underline ${FOCUS_LIGHT}`}>
          {att.filename}
        </button>
        <span className="text-xs text-slate-700">{att.kind === "PDF" ? "PDF" : "Image"} · {formatBytes(att.size)}</span>
      </span>
      <button
        type="button"
        disabled={locked}
        onClick={onRemove}
        aria-label={`Remove attachment: ${att.filename}`}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-500 ${FOCUS_LIGHT}`}
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/**
 * Attachments: images (1 MB, re-encoded in the browser like the project brief, which also strips
 * location data) and PDFs (5 MB). 5 per task and 50 MB per group; the server enforces all of it.
 */
export function AttachmentsSection({ task, attachments, storage, lockedReason, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = lockedReason !== null;
  const full = attachments.length >= TASK_LIMITS.attachmentsPerTask;

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage("");
    const problem = file.type === "application/pdf" ? isAcceptedBriefPdf(file) : isAcceptedBriefImage(file);
    if (problem) { setMessage(problem); return; }
    setBusy(true);
    try {
      const body = file.type === "application/pdf" ? file : await prepareBriefImage(file);
      const saved = await onUpload(body, file.name);
      if (saved) setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add that file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`attachments-${task.id}`} title={locked ? lockedReason : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`attachments-${task.id}`} className="text-sm font-semibold text-slate-900">Attachments</h3>
        <span className="text-xs tabular-nums text-slate-700">{attachments.length} of {TASK_LIMITS.attachmentsPerTask}</span>
      </div>

      {attachments.length === 0 && <p className="mt-2 text-sm text-slate-700">No attachments yet.</p>}
      <ul className="mt-2 space-y-1.5">
        {attachments.map((a) => (
          <AttachmentRow key={a.id} task={task} att={a} locked={locked} onRemove={() => void onRemove(a.id)} />
        ))}
      </ul>

      {!locked && (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(e) => void choose(e)}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a file to attach"
          />
          <button type="button" disabled={full || busy} onClick={() => inputRef.current?.click()} className={BUTTON_SECONDARY_COMPACT}>
            <PlusIcon className="mr-1 h-4 w-4" />
            {busy ? "Adding…" : "Add attachment"}
          </button>
          <span className="ml-2 text-xs text-slate-700">
            {full ? "This task has 5 attachments." : "JPG, PNG or WebP up to 1 MB, or a PDF up to 5 MB."}
          </span>
        </div>
      )}
      {locked && <p className="mt-2 text-xs text-slate-700">{lockedReason}</p>}
      {message && <p role="alert" className="mt-2 text-sm font-medium text-red-800">{message}</p>}
      <p className="mt-2 text-xs tabular-nums text-slate-700">
        Storage used: {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes).replace(".0 MB", " MB")}
      </p>
    </section>
  );
}
