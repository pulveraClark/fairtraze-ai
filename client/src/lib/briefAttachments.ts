import { API_BASE_URL } from "./apiBase";

export type AttachmentKind = "IMAGE" | "PDF";

export interface BriefAttachment {
  id: number;
  kind: AttachmentKind;
  mime: string;
  filename: string;
  size: number;
  order: number;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

/**
 * The Blob type is always chosen here from a fixed allow-list, never taken from a response
 * header or from a File — so a tampered Content-Type can't turn an attachment into HTML/SVG.
 */
export function allowedBlobType(att: Pick<BriefAttachment, "kind" | "mime">): string | null {
  if (att.kind === "PDF") return "application/pdf";
  return IMAGE_MIMES.includes(att.mime) ? att.mime : null;
}

const url = (assignmentId: number, attId?: number) =>
  `${API_BASE_URL}/api/assignments/${assignmentId}/attachments${attId !== undefined ? `/${attId}` : ""}`;

// One in-flight/finished fetch per attachment so thumbnails + viewer share a single request.
const blobCache = new Map<string, Promise<Blob>>();
export function clearBriefBlobCache(): void { blobCache.clear(); }

export function loadAttachmentBlob(assignmentId: number, att: BriefAttachment, token: string): Promise<Blob> {
  const type = allowedBlobType(att);
  if (!type) return Promise.reject(new Error("Unsupported attachment type"));
  const key = `${assignmentId}:${att.id}:${att.size}`;
  let p = blobCache.get(key);
  if (!p) {
    p = fetch(url(assignmentId, att.id), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`attachment ${res.status}`);
        return new Blob([await res.arrayBuffer()], { type });
      });
    p.catch(() => blobCache.delete(key));
    blobCache.set(key, p);
  }
  return p;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function uploadAttachment(
  assignmentId: number, blob: Blob, filename: string, token: string
): Promise<BriefAttachment> {
  const res = await fetch(`${url(assignmentId)}?filename=${encodeURIComponent(filename)}`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type },
    body:    blob,
  });
  if (!res.ok) throw new Error(await errorMessage(res, `Upload failed (${res.status})`));
  return (await res.json()) as BriefAttachment;
}

export async function deleteAttachment(assignmentId: number, attId: number, token: string): Promise<void> {
  const res = await fetch(url(assignmentId, attId), { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(await errorMessage(res, `Delete failed (${res.status})`));
}

export async function reorderImages(assignmentId: number, ids: number[], token: string): Promise<void> {
  const res = await fetch(`${url(assignmentId)}/order`, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, `Reorder failed (${res.status})`));
}

// ── Draft model shared by the create and edit forms ──────────────────────────
export interface DraftItem {
  key: string;
  name: string;
  existing?: BriefAttachment; // already stored on the server
  blob?: Blob;                // new file waiting to upload (images are already resized/re-encoded)
  previewUrl?: string;        // object URL for new images
  error?: string;             // set when its upload failed
}

export interface BriefDraft {
  images: DraftItem[];
  pdf: DraftItem | null;
  removedIds: number[];
}

export const emptyDraft = (): BriefDraft => ({ images: [], pdf: null, removedIds: [] });

export function draftFromAttachments(atts: BriefAttachment[]): BriefDraft {
  const toItem = (a: BriefAttachment): DraftItem => ({ key: `e${a.id}`, name: a.filename, existing: a });
  return {
    images: atts.filter((a) => a.kind === "IMAGE").sort((a, b) => a.order - b.order).map(toItem),
    pdf: atts.filter((a) => a.kind === "PDF").map(toItem)[0] ?? null,
    removedIds: [],
  };
}

export interface SyncResult { failed: DraftItem[]; }

/** Uploads one item; records failure on the item instead of throwing. */
async function uploadItem(assignmentId: number, item: DraftItem, token: string): Promise<BriefAttachment | null> {
  if (!item.blob) return null;
  try {
    return await uploadAttachment(assignmentId, item.blob, item.name, token);
  } catch (e) {
    item.error = e instanceof Error ? e.message : "Upload failed";
    return null;
  }
}

/** Applies a draft to the server: deletes, then uploads, then (images) reorders. Never throws for per-file failures. */
export async function syncBrief(assignmentId: number, draft: BriefDraft, token: string): Promise<SyncResult> {
  const failed: DraftItem[] = [];
  for (const id of draft.removedIds) {
    try { await deleteAttachment(assignmentId, id, token); } catch { /* already gone */ }
  }
  const imageIds: number[] = [];
  for (const item of draft.images) {
    if (item.existing) { imageIds.push(item.existing.id); continue; }
    const saved = await uploadItem(assignmentId, item, token);
    if (saved) imageIds.push(saved.id); else failed.push(item);
  }
  if (draft.pdf && !draft.pdf.existing) {
    const saved = await uploadItem(assignmentId, draft.pdf, token);
    if (!saved) failed.push(draft.pdf);
  }
  if (imageIds.length > 1) {
    try { await reorderImages(assignmentId, imageIds, token); } catch { /* order is cosmetic */ }
  }
  return { failed };
}

/** Retries only the files that failed (no reordering). */
export async function retryUploads(assignmentId: number, items: DraftItem[], token: string): Promise<SyncResult> {
  const failed: DraftItem[] = [];
  for (const item of items) {
    item.error = undefined;
    const saved = await uploadItem(assignmentId, item, token);
    if (!saved) failed.push(item);
  }
  return { failed };
}
