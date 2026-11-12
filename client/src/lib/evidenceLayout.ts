// How tightly the evidence sheet sets its member table so a normal group stays on one Letter page.
// Rows are never clipped: past the compact range the sheet simply grows onto a second page, and then the
// page count is not known here, so the footer omits "of Y" (or the whole number, in a bulk export) instead of
// showing a wrong one.

export type SheetDensity = "normal" | "compact";

/** Most members that still fit one page in compact density (estimated from the fixed blocks of the sheet). */
export const MAX_MEMBERS_ONE_PAGE = 16;

export function sheetDensity(memberCount: number): SheetDensity {
  return memberCount <= 8 ? "normal" : "compact";
}

export function fitsOnePage(memberCount: number): boolean {
  return memberCount <= MAX_MEMBERS_ONE_PAGE;
}

/** Position of one sheet in a bulk export: its 1-based index and how many sheets there are. */
export interface BulkPosition { index: number; count: number; allFitOnePage: boolean }

/**
 * Footer page text. Single sheet: "Page 1 of 1" when it is known to fit one page, otherwise "Page 1".
 * Bulk: "Page i of N" only while every sheet is known to be exactly one page; otherwise nothing (empty string),
 * because a later sheet's number would be wrong as soon as an earlier one flows onto a second page.
 */
export function pageLabel(memberCount: number, bulk?: BulkPosition): string {
  if (bulk) return bulk.allFitOnePage ? `Page ${bulk.index} of ${bulk.count}` : "";
  return fitsOnePage(memberCount) ? "Page 1 of 1" : "Page 1";
}
