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

// ── Orientation and margins (page setup) ─────────────────────────────────────────────────────────
// Still layout only: never read by scoring.
export const PAGE_ORIENTATIONS = ["PORTRAIT", "LANDSCAPE"] as const;
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number];
export const DEFAULT_PAGE_ORIENTATION: PageOrientation = "PORTRAIT";

export const MARGIN_PRESET_KEYS = ["NORMAL", "NARROW", "WIDE"] as const;
export type MarginPresetKey = (typeof MARGIN_PRESET_KEYS)[number];
export const DEFAULT_MARGIN_PRESET: MarginPresetKey = "NORMAL";

export interface MarginDef {
  label: string;
  /** CSS px @96dpi. */
  topPx: number;
  bottomPx: number;
  leftPx: number;
  rightPx: number;
}

export const MARGIN_PRESETS: Record<MarginPresetKey, MarginDef> = {
  NORMAL: { label: "Normal (1 in)", topPx: 96, bottomPx: 96, leftPx: 96, rightPx: 96 },
  NARROW: { label: "Narrow (0.5 in)", topPx: 48, bottomPx: 48, leftPx: 48, rightPx: 48 },
  WIDE: { label: "Wide (1 in top and bottom, 2 in sides)", topPx: 96, bottomPx: 96, leftPx: 192, rightPx: 192 },
};

export function isPageOrientation(v: unknown): v is PageOrientation {
  return typeof v === "string" && (PAGE_ORIENTATIONS as readonly string[]).includes(v);
}
export function isMarginPreset(v: unknown): v is MarginPresetKey {
  return typeof v === "string" && (MARGIN_PRESET_KEYS as readonly string[]).includes(v);
}

export interface PageGeometry {
  widthPx: number;
  heightPx: number;
  /** For `@page { size: <cssWidth> <cssHeight> }` - already swapped for landscape. */
  cssWidth: string;
  cssHeight: string;
  widthTwip: number;
  heightTwip: number;
  marginTopPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  landscape: boolean;
}

/** One place that turns (paper, orientation, margins) into the numbers every renderer needs. */
export function resolvePageGeometry(
  size: PageSizeKey,
  orientation: PageOrientation = DEFAULT_PAGE_ORIENTATION,
  margins: MarginPresetKey = DEFAULT_MARGIN_PRESET
): PageGeometry {
  const s = PAGE_SIZES[size];
  const m = MARGIN_PRESETS[margins];
  const landscape = orientation === "LANDSCAPE";
  return {
    widthPx: landscape ? s.heightPx : s.widthPx,
    heightPx: landscape ? s.widthPx : s.heightPx,
    cssWidth: landscape ? s.cssHeight : s.cssWidth,
    cssHeight: landscape ? s.cssWidth : s.cssHeight,
    widthTwip: landscape ? s.heightTwip : s.widthTwip,
    heightTwip: landscape ? s.widthTwip : s.heightTwip,
    marginTopPx: m.topPx,
    marginBottomPx: m.bottomPx,
    marginLeftPx: m.leftPx,
    marginRightPx: m.rightPx,
    landscape,
  };
}

// ── Header / footer text ────────────────────────────────────────────────────────────────────────
/** Plain text per slot (left / centre / right) of the header and of the footer. */
export const HF_SLOT_MAX_CHARS = 120;
/** The one token: replaced by the page number wherever it appears. */
export const PAGE_TOKEN = "{page}";

/** Removes control characters (and so line breaks); length is validated separately, never truncated. */
export function sanitizeHeaderFooterText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0x20 && c !== 0x7f && !(c >= 0x80 && c <= 0x9f) && c !== 0x2028 && c !== 0x2029) out += value[i];
  }
  return out;
}
