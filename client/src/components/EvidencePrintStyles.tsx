// Print rules shared by every place the evidence sheet prints (student page, instructor export, bulk export).
// @page margin 0 is what removes the browser's own header and footer; the sheet carries its own padding.
// The sheet is at least one Letter page and is never clipped, so a long group flows onto a second page.
// min-height is a hair under 11in so rounding can never add a blank page after a one-page sheet.
export const EVIDENCE_SHEET_CSS = `
@page { size: Letter portrait; margin: 0; }
.ft-evidence-sheet {
  box-sizing: border-box; width: 8.5in; min-height: 11in; margin: 0 auto; padding: 0.6in 0.65in 0.5in;
  display: flex; flex-direction: column;
}
@media print {
  html, body { background: #ffffff !important; margin: 0 !important; }
  .ft-evidence-sheet { box-shadow: none; margin: 0; min-height: 10.95in; }
  .ft-evidence-bulk-break { break-after: page; page-break-after: always; }
}
`;

export function EvidencePrintStyles() {
  return <style>{EVIDENCE_SHEET_CSS}</style>;
}
