import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Linkified } from "../lib/linkify";
import { loadAttachmentBlob, type BriefAttachment } from "../lib/briefAttachments";
import { useFocusTrap } from "./ui/useFocusTrap";
import { BUTTON_SECONDARY_COMPACT, CARD, FOCUS_LIGHT } from "./ui/styles";

/** Object URL for an authenticated attachment image; revoked on unmount. */
function useAttachmentUrl(assignmentId: number, att: BriefAttachment | undefined, token: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!att || !token) return;
    let url: string | null = null;
    let cancelled = false;
    loadAttachmentBlob(assignmentId, att, token)
      .then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [assignmentId, att, token]);
  return { src, failed };
}

export function AttachmentImage({
  assignmentId, att, className = "", alt,
}: { assignmentId: number; att: BriefAttachment; className?: string; alt: string }) {
  const { token } = useAuth();
  const { src, failed } = useAttachmentUrl(assignmentId, att, token);
  if (failed) {
    return <div className={`flex items-center justify-center bg-slate-100 text-xs text-slate-600 ${className}`}>Image unavailable</div>;
  }
  if (!src) return <div className={`animate-pulse bg-slate-100 ${className}`} aria-hidden="true" />;
  return <img src={src} alt={alt} className={className} />;
}

function ImageViewer({
  assignmentId, images, startIndex, onClose,
}: { assignmentId: number; images: BriefAttachment[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref, onClose);

  const go = useCallback((d: number) => setIndex((i) => (i + d + images.length) % images.length), [images.length]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go]);

  const current = images[index];
  const btn = `inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20 ${FOCUS_LIGHT}`;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={`Image ${index + 1} of ${images.length}`}
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 pb-3" onClick={(e) => e.stopPropagation()}>
        <span className="truncate text-sm text-white">{current.filename} · {index + 1} / {images.length}</span>
        <button type="button" onClick={onClose} className={btn}>Close</button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && <button type="button" onClick={() => go(-1)} className={btn} aria-label="Previous image">←</button>}
        <AttachmentImage
          assignmentId={assignmentId}
          att={current}
          alt={current.filename}
          className="max-h-full max-w-full min-w-0 rounded-lg object-contain"
        />
        {images.length > 1 && <button type="button" onClick={() => go(1)} className={btn} aria-label="Next image">→</button>}
      </div>
    </div>
  );
}

interface Props {
  assignmentId: number;
  description: string | null;
  attachments: BriefAttachment[];
  /** Instructor view: shows an Edit button. */
  onEdit?: () => void;
  /** Open by default the first time this user sees this brief (remembered per assignment). */
  rememberOpenState?: boolean;
  /** Skip the collapsible wrapper (used inside the "View brief" modal). */
  alwaysOpen?: boolean;
}

const seenKey = (id: number) => `ft.brief.seen.${id}`;

export function BriefCard({ assignmentId, description, attachments, onEdit, rememberOpenState = false, alwaysOpen = false }: Props) {
  const { token } = useAuth();
  const images = attachments.filter((a) => a.kind === "IMAGE");
  const pdf = attachments.find((a) => a.kind === "PDF") ?? null;
  const hasContent = !!description || attachments.length > 0;

  const [open, setOpen] = useState(() => {
    if (alwaysOpen || !rememberOpenState) return true;
    try { return localStorage.getItem(seenKey(assignmentId)) === null; } catch { return true; }
  });
  useEffect(() => {
    if (!rememberOpenState) return;
    try { localStorage.setItem(seenKey(assignmentId), "1"); } catch { /* private mode */ }
  }, [assignmentId, rememberOpenState]);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function openPdf(download: boolean) {
    if (!pdf || !token) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const blob = await loadAttachmentBlob(assignmentId, pdf, token);
      const url = URL.createObjectURL(blob); // blob is always typed application/pdf (see allowedBlobType)
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = pdf.filename || "brief.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setPdfError("Could not load the PDF. Try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  const bodyId = `brief-body-${assignmentId}`;
  const header = (
    <div className="flex min-h-10 items-center justify-between gap-3">
      {alwaysOpen ? (
        <h2 className="text-base font-semibold text-slate-900">Project brief</h2>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          className={`flex min-h-10 flex-1 items-center gap-2 rounded-lg text-left ${FOCUS_LIGHT}`}
        >
          <svg className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-base font-semibold text-slate-900">Project brief</span>
          <span className="text-xs text-slate-600">{open ? "Hide" : "Show"}</span>
        </button>
      )}
      {onEdit && (
        <button type="button" onClick={onEdit} className={BUTTON_SECONDARY_COMPACT}>Edit</button>
      )}
    </div>
  );

  return (
    <section className={`${CARD} p-4`} aria-label="Project brief">
      {header}
      {open && (
        <div id={bodyId} className="mt-2 space-y-4">
          {!hasContent && (
            <p className="text-sm text-slate-600">
              {onEdit ? "No brief yet. Use Edit to add a description or files for your students." : "The instructor has not added a brief for this project."}
            </p>
          )}
          {description && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
              <Linkified text={description} />
            </p>
          )}
          {images.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {images.map((img, i) => (
                <li key={img.id}>
                  <button
                    type="button"
                    onClick={() => setViewerIndex(i)}
                    aria-label={`Enlarge image ${i + 1} of ${images.length}: ${img.filename}`}
                    className={`block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 ${FOCUS_LIGHT}`}
                  >
                    <AttachmentImage assignmentId={assignmentId} att={img} alt={img.filename} className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pdf && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-sm text-slate-800">{pdf.filename}</span>
              <button type="button" disabled={pdfBusy} onClick={() => void openPdf(false)} className={BUTTON_SECONDARY_COMPACT}>Open PDF</button>
              <button type="button" disabled={pdfBusy} onClick={() => void openPdf(true)} className={BUTTON_SECONDARY_COMPACT}>Download</button>
              {pdfError && <span role="alert" className="text-xs text-red-700">{pdfError}</span>}
            </div>
          )}
        </div>
      )}
      {viewerIndex !== null && (
        <ImageViewer assignmentId={assignmentId} images={images} startIndex={viewerIndex} onClose={() => setViewerIndex(null)} />
      )}
    </section>
  );
}

/** Modal wrapper so students can read a brief from the class page before joining a group. */
export function BriefModal({
  assignmentId, title, description, attachments, onClose,
}: { assignmentId: number; title: string; description: string | null; attachments: BriefAttachment[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref, onClose);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={`Project brief: ${title}`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm text-slate-600">{title}</p>
          <button type="button" onClick={onClose} className={BUTTON_SECONDARY_COMPACT}>Close</button>
        </div>
        <BriefCard assignmentId={assignmentId} description={description} attachments={attachments} alwaysOpen />
      </div>
    </div>
  );
}
