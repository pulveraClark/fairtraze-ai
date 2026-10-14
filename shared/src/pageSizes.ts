// Layout-only paper definitions for FairTraze Docs' page view, PDF export and .docx export.
// Never read by scoring — page layout adds zero characters to anyone's authorship count.
export const PAGE_SIZE_KEYS = ["SHORT", "LONG", "A4"] as const;
export type PageSizeKey = (typeof PAGE_SIZE_KEYS)[number];

export const DEFAULT_PAGE_SIZE: PageSizeKey = "SHORT";

export interface PageSizeDef {
  label: string;
  /** Paper size in CSS px @96dpi (Chrome's print engine maps 96px = 1in). */
  widthPx: number;
  heightPx: number;
  /** Same paper in inches / CSS length strings, for `@page { size }`. */
  cssWidth: string;
  cssHeight: string;
  /** Same paper in twips (1/1440in) for .docx sections. */
  widthTwip: number;
  heightTwip: number;
}

export const PAGE_SIZES: Record<PageSizeKey, PageSizeDef> = {
  SHORT: { label: "Short (8.5 × 11 in)", widthPx: 816, heightPx: 1056, cssWidth: "8.5in", cssHeight: "11in", widthTwip: 12240, heightTwip: 15840 },
  LONG: { label: "Long (8.5 × 13 in)", widthPx: 816, heightPx: 1248, cssWidth: "8.5in", cssHeight: "13in", widthTwip: 12240, heightTwip: 18720 },
  A4: { label: "A4 (210 × 297 mm)", widthPx: 794, heightPx: 1123, cssWidth: "210mm", cssHeight: "297mm", widthTwip: 11906, heightTwip: 16838 },
};

/** Default margin: 1 inch on all sides. */
export const PAGE_MARGIN_PX = 96;
export const PAGE_MARGIN_TWIP = 1440;

export function isPageSizeKey(v: unknown): v is PageSizeKey {
  return typeof v === "string" && (PAGE_SIZE_KEYS as readonly string[]).includes(v);
}
