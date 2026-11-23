// Header/footer text for the page view and the PDF. Plain text only, set per document by the
// students (the app adds none of its own). tiptap-pagination-plus takes two HTML strings per band
// (left and right) and has no centre slot, so the centre text rides inside the left string as an
// absolutely positioned span (see .ft-hf-* in index.css). Everything typed is HTML-escaped here;
// {page} is the only token and becomes the plugin's CSS page counter.

import { HF_SLOT_MAX_CHARS, PAGE_TOKEN } from "@shared/pageSizes";

export { HF_SLOT_MAX_CHARS, PAGE_TOKEN };

export interface HeaderFooterText {
  left: string;
  center: string;
  right: string;
}

export const EMPTY_HEADER_FOOTER: HeaderFooterText = { left: "", center: "", right: "" };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Header counters and footer counters are different CSS counters inside the plugin. */
export type HfKind = "header" | "footer";

function slotHtml(text: string, kind: HfKind): string {
  const counter = kind === "header" ? "rm-page-number-plus" : "rm-page-number";
  return text
    .slice(0, HF_SLOT_MAX_CHARS)
    .split(PAGE_TOKEN)
    .map(escapeHtml)
    .join(`<span class="${counter}"></span>`);
}

export function hasHeaderFooterText(t: HeaderFooterText): boolean {
  return Boolean(t.left || t.center || t.right);
}

/**
 * The `[left, right]` HTML strings to hand to updateHeaderContent / updateFooterContent.
 * Returns two empty strings when nothing is set, so no empty band is ever added.
 */
export function headerFooterHtml(t: HeaderFooterText, kind: HfKind): [string, string] {
  if (!hasHeaderFooterText(t)) return ["", ""];
  // A non-breaking space keeps a band one line tall when only the centre slot has text, because an
  // absolutely positioned centre span adds no height of its own.
  const left = `<span class="ft-hf-slot ft-hf-left">${slotHtml(t.left, kind) || "&nbsp;"}</span>`;
  const center = t.center ? `<span class="ft-hf-slot ft-hf-center">${slotHtml(t.center, kind)}</span>` : "";
  const right = t.right ? `<span class="ft-hf-slot ft-hf-right">${slotHtml(t.right, kind)}</span>` : "";
  return [left + center, right];
}
