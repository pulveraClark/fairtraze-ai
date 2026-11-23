// Layout-only paper definitions for FairTraze Docs' page view, PDF export and .docx export.
// Never read by scoring — page layout adds zero characters to anyone's authorship count.
export const PAGE_SIZE_KEYS = ["LETTER", "LEGAL", "A4"] as const;
export type PageSizeKey = (typeof PAGE_SIZE_KEYS)[number];

export const DEFAULT_PAGE_SIZE: PageSizeKey = "LETTER";

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
  LETTER: { label: "Letter (8.5 × 11 in)", widthPx: 816, heightPx: 1056, cssWidth: "8.5in", cssHeight: "11in", widthTwip: 12240, heightTwip: 15840 },
  LEGAL: { label: "Legal (8.5 × 14 in)", widthPx: 816, heightPx: 1344, cssWidth: "8.5in", cssHeight: "14in", widthTwip: 12240, heightTwip: 20160 },
  A4: { label: "A4 (210 × 297 mm)", widthPx: 794, heightPx: 1123, cssWidth: "210mm", cssHeight: "297mm", widthTwip: 11906, heightTwip: 16838 },
};

export function isPageSizeKey(v: unknown): v is PageSizeKey {
  return typeof v === "string" && (PAGE_SIZE_KEYS as readonly string[]).includes(v);
}

/**
 * Paper keys used before migration 20261017100000_page_size_rename_custom_margins (SHORT = Letter,
 * LONG = 13in, now Legal). TEMPORARY: only for the deploy window where a tab or response may still
 * carry an old key. Remove once no client older than that migration can be open.
 */
export function normalizePageSizeKey(v: unknown): PageSizeKey | null {
  if (v === "SHORT") return "LETTER";
  if (v === "LONG") return "LEGAL";
  return isPageSizeKey(v) ? v : null;
}

/** Default margin: 1 inch on all sides. */
export const PAGE_MARGIN_PX = 96;
export const PAGE_MARGIN_TWIP = 1440;

// ── Orientation and margins (page setup) ─────────────────────────────────────────────────────────
// Still layout only: never read by scoring.
export const PAGE_ORIENTATIONS = ["PORTRAIT", "LANDSCAPE"] as const;
export type PageOrientation = (typeof PAGE_ORIENTATIONS)[number];
export const DEFAULT_PAGE_ORIENTATION: PageOrientation = "PORTRAIT";

export const MARGIN_PRESET_KEYS = ["NORMAL", "NARROW", "WIDE", "CUSTOM"] as const;
export type MarginPresetKey = (typeof MARGIN_PRESET_KEYS)[number];
export const DEFAULT_MARGIN_PRESET: MarginPresetKey = "NORMAL";

/** Margins in inches: the stored, editable form (the four Document margin columns). */
export interface MarginsIn {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export type FixedMarginPresetKey = Exclude<MarginPresetKey, "CUSTOM">;

export const MARGIN_PRESETS: Record<FixedMarginPresetKey, MarginsIn & { label: string }> = {
  NORMAL: { label: "Normal (1 in)", top: 1, bottom: 1, left: 1, right: 1 },
  NARROW: { label: "Narrow (0.5 in)", top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  WIDE: { label: "Wide (1 in top and bottom, 2 in sides)", top: 1, bottom: 1, left: 2, right: 2 },
};
export const MARGIN_PRESET_LABELS: Record<MarginPresetKey, string> = {
  NORMAL: MARGIN_PRESETS.NORMAL.label,
  NARROW: MARGIN_PRESETS.NARROW.label,
  WIDE: MARGIN_PRESETS.WIDE.label,
  CUSTOM: "Custom",
};

export const MARGIN_MIN_IN = 0;
export const MARGIN_MAX_IN = 3;
export const MARGIN_STEP_IN = 0.1;
/** At least this much writing space must remain in both width and height. */
export const MIN_WRITING_IN = 2;
/** One header or footer line takes about this much writing height (header/footer text uses body space; see CLAUDE.md). */
export const HEADER_FOOTER_LINE_IN = 0.3;

export function isPageOrientation(v: unknown): v is PageOrientation {
  return typeof v === "string" && (PAGE_ORIENTATIONS as readonly string[]).includes(v);
}
export function isMarginPreset(v: unknown): v is MarginPresetKey {
  return typeof v === "string" && (MARGIN_PRESET_KEYS as readonly string[]).includes(v);
}

/** The four margins for a preset; `custom` supplies the values for CUSTOM. */
export function resolveMargins(preset: MarginPresetKey, custom?: MarginsIn | null): MarginsIn {
  if (preset === "CUSTOM") return custom ? { ...custom } : { top: 1, bottom: 1, left: 1, right: 1 };
  const { top, bottom, left, right } = MARGIN_PRESETS[preset];
  return { top, bottom, left, right };
}

export interface PageSetupToValidate {
  size: PageSizeKey;
  orientation: PageOrientation;
  margins: MarginsIn;
  /** True when any header / footer slot has text. */
  hasHeader?: boolean;
  hasFooter?: boolean;
}

const onStep = (v: number) => Math.abs(v / MARGIN_STEP_IN - Math.round(v / MARGIN_STEP_IN)) < 1e-6;
const fmtIn = (n: number) => String(Math.round(Math.max(0, n) * 100) / 100);

/** The one validation, used by the Page setup dialog and the server. A clear message, or null when fine. */
export function validateMargins(p: PageSetupToValidate): string | null {
  const names: [keyof MarginsIn, string][] = [["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]];
  for (const [k, label] of names) {
    const v = p.margins[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return `${label} margin must be a number.`;
    if (v < MARGIN_MIN_IN || v > MARGIN_MAX_IN) return `${label} margin must be between ${MARGIN_MIN_IN} and ${MARGIN_MAX_IN} in.`;
    if (!onStep(v)) return `${label} margin must be a multiple of ${MARGIN_STEP_IN} in.`;
  }
  const paper = PAGE_SIZES[p.size];
  const land = p.orientation === "LANDSCAPE";
  const wIn = (land ? paper.heightPx : paper.widthPx) / 96;
  const hIn = (land ? paper.widthPx : paper.heightPx) / 96;
  const writeW = wIn - p.margins.left - p.margins.right;
  const bands = (p.hasHeader ? HEADER_FOOTER_LINE_IN : 0) + (p.hasFooter ? HEADER_FOOTER_LINE_IN : 0);
  const writeH = hIn - p.margins.top - p.margins.bottom - bands;
  if (writeW < MIN_WRITING_IN - 1e-9) {
    return `Left and right margins leave ${fmtIn(writeW)} in of writing width; at least ${MIN_WRITING_IN} in is needed. Reduce the left or right margin.`;
  }
  if (writeH < MIN_WRITING_IN - 1e-9) {
    return `Top and bottom margins${bands ? " and the header/footer" : ""} leave ${fmtIn(writeH)} in of writing height; at least ${MIN_WRITING_IN} in is needed. Reduce the top or bottom margin.`;
  }
  return null;
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
  margins: MarginPresetKey = DEFAULT_MARGIN_PRESET,
  custom?: MarginsIn | null
): PageGeometry {
  const s = PAGE_SIZES[size];
  const m = resolveMargins(margins, custom);
  const landscape = orientation === "LANDSCAPE";
  return {
    widthPx: landscape ? s.heightPx : s.widthPx,
    heightPx: landscape ? s.widthPx : s.heightPx,
    cssWidth: landscape ? s.cssHeight : s.cssWidth,
    cssHeight: landscape ? s.cssWidth : s.cssHeight,
    widthTwip: landscape ? s.heightTwip : s.widthTwip,
    heightTwip: landscape ? s.widthTwip : s.heightTwip,
    marginTopPx: m.top * 96,
    marginBottomPx: m.bottom * 96,
    marginLeftPx: m.left * 96,
    marginRightPx: m.right * 96,
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
