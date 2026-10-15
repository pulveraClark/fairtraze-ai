import type { Editor } from "@tiptap/core";
import {
  DEFAULT_MARGIN_PRESET,
  DEFAULT_PAGE_ORIENTATION,
  DEFAULT_PAGE_SIZE,
  isMarginPreset,
  isPageOrientation,
  isPageSizeKey,
} from "@shared/pageSizes";
import type { MarginPresetKey, PageOrientation, PageSizeKey } from "@shared/pageSizes";
import { EMPTY_HEADER_FOOTER, headerFooterHtml } from "./headerFooter";
import type { HeaderFooterText } from "./headerFooter";
import { paginationSize } from "./pageLayout";

/**
 * Per-document page setup, shared by every collaborator. Stored as plain columns on Document (NOT in
 * the Yjs document), so it can never produce an EditEvent or change anyone's authorship count.
 */
export interface PageSetup {
  pageSize: PageSizeKey;
  orientation: PageOrientation;
  marginPreset: MarginPresetKey;
  header: HeaderFooterText;
  footer: HeaderFooterText;
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  pageSize: DEFAULT_PAGE_SIZE,
  orientation: DEFAULT_PAGE_ORIENTATION,
  marginPreset: DEFAULT_MARGIN_PRESET,
  header: EMPTY_HEADER_FOOTER,
  footer: EMPTY_HEADER_FOOTER,
};

function parseText(raw: unknown): HeaderFooterText {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { left: s(o.left), center: s(o.center), right: s(o.right) };
}

/** Validates the server's page-setup payload; anything unexpected falls back to the default. */
export function parsePageSetup(raw: unknown): PageSetup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!isPageSizeKey(o.pageSize)) return null;
  return {
    pageSize: o.pageSize,
    orientation: isPageOrientation(o.orientation) ? o.orientation : DEFAULT_PAGE_ORIENTATION,
    marginPreset: isMarginPreset(o.marginPreset) ? o.marginPreset : DEFAULT_MARGIN_PRESET,
    header: parseText(o.header),
    footer: parseText(o.footer),
  };
}

export function samePageSetup(a: PageSetup, b: PageSetup): boolean {
  return (
    a.pageSize === b.pageSize &&
    a.orientation === b.orientation &&
    a.marginPreset === b.marginPreset &&
    (["left", "center", "right"] as const).every((k) => a.header[k] === b.header[k] && a.footer[k] === b.footer[k])
  );
}

/**
 * Pushes the setup into the pagination plugin. Pure layout: these commands only set the plugin's
 * storage (plus an empty transaction so it re-measures) - nothing reaches the Yjs document.
 */
export function applyPageSetup(editor: Editor, setup: PageSetup): void {
  const [hl, hr] = headerFooterHtml(setup.header, "header");
  const [fl, fr] = headerFooterHtml(setup.footer, "footer");
  editor
    .chain()
    .updatePageSize(paginationSize(setup.pageSize, setup.orientation, setup.marginPreset))
    .updateHeaderContent(hl, hr)
    .updateFooterContent(fl, fr)
    .run();
}
