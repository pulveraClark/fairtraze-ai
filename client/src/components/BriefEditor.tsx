import { useRef, useState } from "react";
import { AttachmentImage } from "./BriefCard";
import { BUTTON_SECONDARY_COMPACT, FOCUS_LIGHT } from "./ui/styles";
import {
  BRIEF_DESCRIPTION_MAX, BRIEF_MAX_IMAGES, isAcceptedBriefImage, isAcceptedBriefPdf, prepareBriefImage,
} from "../lib/briefImage";
import type { BriefDraft, DraftItem } from "../lib/briefAttachments";

interface Props {
  assignmentId: number | null; // null while creating (no stored attachments yet)
  description: string;
  onDescriptionChange: (v: string) => void;
  draft: BriefDraft;
  onDraftChange: (d: BriefDraft) => void;
  disabled?: boolean;
}

const INPUT = `w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-500 ${FOCUS_LIGHT}`;
let keySeq = 0;
const nextKey = () => `n${++keySeq}`;

/** Description + image/PDF editor. Pure draft state: the parent syncs it to the server on save. */
export function BriefEditor({ assignmentId, description, onDescriptionChange, draft, onDraftChange, disabled }: Props) {
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addImages(files: FileList | null) {
    if (!files) return;
    setMsg(null);
    setBusy(true);
    const added: DraftItem[] = [];
    try {
      for (const file of Array.from(files)) {
        if (draft.images.length + added.length >= BRIEF_MAX_IMAGES) {
          setMsg(`A project can have at most ${BRIEF_MAX_IMAGES} images.`);
          break;
        }
        const problem = isAcceptedBriefImage(file);
        if (problem) { setMsg(`${file.name}: ${problem}`); continue; }
        try {
          const blob = await prepareBriefImage(file);
          added.push({ key: nextKey(), name: file.name, blob, previewUrl: URL.createObjectURL(blob) });
        } catch (e) {
          setMsg(`${file.name}: ${e instanceof Error ? e.message : "Could not process this image."}`);
        }
      }
    } finally {
      setBusy(false);
      if (imageInput.current) imageInput.current.value = "";
    }
    if (added.length) onDraftChange({ ...draft, images: [...draft.images, ...added] });
  }

  function addPdf(files: FileList | null) {
    const file = files?.[0];
    if (pdfInput.current) pdfInput.current.value = "";
    if (!file) return;
    const problem = isAcceptedBriefPdf(file);
    if (problem) { setMsg(`${file.name}: ${problem}`); return; }
    setMsg(null);
    const removedIds = draft.pdf?.existing ? [...draft.removedIds, draft.pdf.existing.id] : draft.removedIds;
    onDraftChange({ ...draft, removedIds, pdf: { key: nextKey(), name: file.name, blob: file } });
  }

  function removeImage(i: number) {
    const item = draft.images[i];
    const removedIds = item.existing ? [...draft.removedIds, item.existing.id] : draft.removedIds;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    onDraftChange({ ...draft, removedIds, images: draft.images.filter((_, j) => j !== i) });
  }

  function moveImage(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= draft.images.length) return;
    const images = [...draft.images];
    [images[i], images[j]] = [images[j], images[i]];
    onDraftChange({ ...draft, images });
  }

  function removePdf() {
    const removedIds = draft.pdf?.existing ? [...draft.removedIds, draft.pdf.existing.id] : draft.removedIds;
    onDraftChange({ ...draft, removedIds, pdf: null });
  }

  const remaining = BRIEF_DESCRIPTION_MAX - description.length;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="brief-description" className="mb-1.5 block text-xs font-medium text-slate-700">
          Description <span className="font-normal text-slate-600">(optional)</span>
        </label>
        <textarea
          id="brief-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value.slice(0, BRIEF_DESCRIPTION_MAX))}
          maxLength={BRIEF_DESCRIPTION_MAX}
          rows={6}
          disabled={disabled}
          placeholder="What should students build? Add requirements, links, grading notes… Plain text; links are clickable."
          className={`${INPUT} resize-y`}
          aria-describedby="brief-description-count"
        />
        <p id="brief-description-count" className={`mt-1 text-xs tabular-nums ${remaining < 200 ? "text-amber-800" : "text-slate-600"}`}>
          {remaining.toLocaleString()} characters left
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            Images <span className="font-normal text-slate-600">({draft.images.length}/{BRIEF_MAX_IMAGES}, JPG/PNG/WebP, resized automatically)</span>
          </span>
          <button
            type="button"
            className={BUTTON_SECONDARY_COMPACT}
            disabled={disabled || busy || draft.images.length >= BRIEF_MAX_IMAGES}
            onClick={() => imageInput.current?.click()}
          >
            {busy ? "Processing…" : "Add images"}
          </button>
          <input
            ref={imageInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => void addImages(e.target.files)}
          />
        </div>
        {draft.images.length > 0 && (
          <ul className="space-y-2">
            {draft.images.map((item, i) => (
              <li key={item.key} className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-200 p-2">
                {item.existing && assignmentId !== null ? (
                  <AttachmentImage assignmentId={assignmentId} att={item.existing} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <img src={item.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-800">{item.name}</span>
                  {item.error && <span role="alert" className="block text-xs text-red-700">Upload failed: {item.error}</span>}
                </span>
                <button type="button" className={BUTTON_SECONDARY_COMPACT} disabled={disabled || i === 0} onClick={() => moveImage(i, -1)} aria-label={`Move ${item.name} up`}>↑</button>
                <button type="button" className={BUTTON_SECONDARY_COMPACT} disabled={disabled || i === draft.images.length - 1} onClick={() => moveImage(i, 1)} aria-label={`Move ${item.name} down`}>↓</button>
                <button type="button" className={BUTTON_SECONDARY_COMPACT} disabled={disabled} onClick={() => removeImage(i)} aria-label={`Remove ${item.name}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            PDF <span className="font-normal text-slate-600">(one file, max 5 MB)</span>
          </span>
          <div className="flex gap-2">
            <button type="button" className={BUTTON_SECONDARY_COMPACT} disabled={disabled} onClick={() => pdfInput.current?.click()}>
              {draft.pdf ? "Replace PDF" : "Add PDF"}
            </button>
            {draft.pdf && (
              <button type="button" className={BUTTON_SECONDARY_COMPACT} disabled={disabled} onClick={removePdf}>Remove</button>
            )}
          </div>
          <input ref={pdfInput} type="file" accept="application/pdf" hidden onChange={(e) => addPdf(e.target.files)} />
        </div>
        {draft.pdf && (
          <div className="rounded-lg border border-slate-200 p-2 text-sm text-slate-800">
            <span className="block truncate">{draft.pdf.name}</span>
            {draft.pdf.error && <span role="alert" className="block text-xs text-red-700">Upload failed: {draft.pdf.error}</span>}
          </div>
        )}
      </div>

      {msg && <p role="alert" className="text-xs text-red-700">{msg}</p>}
    </div>
  );
}
