// Image credit in the Docs writing score. Plain counting only: no AI reads or scores images.
//
// Each counted image adds IMAGE_CREDIT_CHARS to the member's retained-text component (and only
// that component: never sessions, never active days). Duplicate images (same content) count once
// per document, very small images never count, and credit stops after the project's image limit.
// The limit is an instructor setting per project (3, 5, 10 or no limit). The thresholds below were
// chosen so that icons and 1-pixel spacers are out and ordinary screenshots and diagrams are in.

/** Characters of writing one counted image is worth (expert survey: most often 100). */
export const IMAGE_CREDIT_CHARS = 100;

/** An image smaller than this many decoded bytes never counts (icons, spacers, stickers). */
export const MIN_COUNTED_IMAGE_BYTES = 5 * 1024;

/** An image whose shorter natural side is below this many pixels never counts. */
export const MIN_COUNTED_IMAGE_SIDE_PX = 100;

/** Allowed values of the per-project limit. null means "No limit". */
export const DOCS_IMAGE_LIMIT_OPTIONS: readonly (number | null)[] = [3, 5, 10, null];
export const DEFAULT_DOCS_IMAGE_LIMIT = 5;

export function isValidDocsImageLimit(v: unknown): v is number | null {
  return v === null || v === 3 || v === 5 || v === 10;
}

/**
 * The limit to use: undefined (an old snapshot or caller) is the default; null is "No limit";
 * anything not allowed falls back to the default with a warning. Never throws.
 */
export function resolveDocsImageLimit(v: unknown): number | null {
  if (v === undefined) return DEFAULT_DOCS_IMAGE_LIMIT;
  if (isValidDocsImageLimit(v)) return v;
  console.warn("[scoring] Invalid image limit; using the default instead.");
  return DEFAULT_DOCS_IMAGE_LIMIT;
}

/** One image that is still in the final document, as recorded when it was inserted. */
export interface PresentDocumentImage {
  contentHash: string;
  ownerUserId: number;
  byteSize: number;
  width: number;  // natural pixels; 0 when the header could not be read
  height: number;
}

/** True when the image is big enough to count. Unknown size (decode failed) never counts. */
export function isImageBigEnough(img: Pick<PresentDocumentImage, "byteSize" | "width" | "height">): boolean {
  if (!(img.byteSize >= MIN_COUNTED_IMAGE_BYTES)) return false;
  return Math.min(img.width, img.height) >= MIN_COUNTED_IMAGE_SIDE_PX;
}

/**
 * Per-member eligible image counts from the images still present in the document: one per
 * content hash (the first listed wins), and big enough. The project limit is applied later,
 * in computeDocumentTeamReport.
 */
export function countEligibleImages(images: readonly PresentDocumentImage[]): Map<number, number> {
  const seen = new Set<string>();
  const byUser = new Map<number, number>();
  for (const img of images) {
    if (seen.has(img.contentHash)) continue;
    seen.add(img.contentHash);
    if (!isImageBigEnough(img)) continue;
    byUser.set(img.ownerUserId, (byUser.get(img.ownerUserId) ?? 0) + 1);
  }
  return byUser;
}

/** Counted images for one member after the limit (null = no limit). */
export function applyImageLimit(eligible: number, limit: number | null): number {
  const n = Math.max(0, Math.floor(eligible));
  return limit === null ? n : Math.min(n, limit);
}
