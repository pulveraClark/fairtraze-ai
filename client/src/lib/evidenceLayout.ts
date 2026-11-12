// How tightly the evidence sheet sets its member table so a normal group stays on one Letter page.
// Rows are never clipped: past the compact range the sheet simply grows onto a second page, and then the
// page count is not known here, so the footer omits "of Y" instead of showing a wrong number.

export type SheetDensity = "normal" | "compact";

/** Most members that still fit one page in compact density (estimated from the fixed blocks of the sheet). */
export const MAX_MEMBERS_ONE_PAGE = 16;

export function sheetDensity(memberCount: number): SheetDensity {
  return memberCount <= 8 ? "normal" : "compact";
}

/** "Page 1 of 1" when the sheet is known to fit one page; "Page 1" when it may flow onto a second one. */
export function pageLabel(memberCount: number, pageNumber = 1, pageCount: number | null = 1): string {
  const knownSinglePage = memberCount <= MAX_MEMBERS_ONE_PAGE;
  if (!knownSinglePage || pageCount === null) return `Page ${pageNumber}`;
  return `Page ${pageNumber} of ${pageCount}`;
}
