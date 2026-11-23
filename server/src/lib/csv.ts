/**
 * Spreadsheet-safe CSV (RFC 4180). A cell that starts with = + - @ tab or CR is read as a formula by Excel and
 * Sheets, and names/emails are user-supplied, so such cells get a leading apostrophe.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 names correctly; CRLF line endings per RFC 4180.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
