/** "<document title>.pdf": the title with characters that are illegal in file names removed. */
export function pdfFileName(title: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = (title ?? "").replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  // A leading/trailing dot or a Windows reserved device name would be refused or hidden by the OS.
  let base = cleaned.replace(/^\.+|\.+$/g, "").trim().slice(0, 100).trim();
  if (!base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = base ? `${base}_` : "document";
  return `${base}.pdf`;
}
