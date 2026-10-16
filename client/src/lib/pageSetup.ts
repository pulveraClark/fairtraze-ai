import type { Editor } from "@tiptap/core";
import {
  DEFAULT_MARGIN_PRESET,
  DEFAULT_PAGE_ORIENTATION,
  DEFAULT_PAGE_SIZE,
  isMarginPreset,
  isPageOrientation,
  normalizePageSizeKey,
  resolveMargins,
} from "@shared/pageSizes";
import type { MarginPresetKey, MarginsIn, PageOrientation, PageSizeKey } from "@shared/pageSizes";
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
  /** The four effective margins in inches (the preset's own numbers for a named preset). */
  margins: MarginsIn;
  header: HeaderFooterText;
  footer: HeaderFooterText;
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  pageSize: DEFAULT_PAGE_SIZE,
  orientation: DEFAULT_PAGE_ORIENTATION,
  marginPreset: DEFAULT_MARGIN_PRESET,
  margins: resolveMargins(DEFAULT_MARGIN_PRESET),
  header: EMPTY_HEADER_FOOTER,
  footer: EMPTY_HEADER_FOOTER,
};

function parseText(raw: unknown): HeaderFooterText {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { left: s(o.left), center: s(o.center), right: s(o.right) };
}

function parseMargins(raw: unknown, preset: MarginPresetKey): MarginsIn {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const top = n(o.top), bottom = n(o.bottom), left = n(o.left), right = n(o.right);
  if (top === null || bottom === null || left === null || right === null) return resolveMargins(preset);
  return resolveMargins(preset, { top, bottom, left, right });
}

/**
 * Validates the server's page-setup payload; anything unexpected falls back to the default. The old
 * paper keys (SHORT/LONG) are still accepted for the deploy window (see normalizePageSizeKey).
 */
export function parsePageSetup(raw: unknown): PageSetup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pageSize = normalizePageSizeKey(o.pageSize);
  if (!pageSize) return null;
  const marginPreset = isMarginPreset(o.marginPreset) ? o.marginPreset : DEFAULT_MARGIN_PRESET;
  return {
    pageSize,
    orientation: isPageOrientation(o.orientation) ? o.orientation : DEFAULT_PAGE_ORIENTATION,
    marginPreset,
    margins: parseMargins(o.margins, marginPreset),
    header: parseText(o.header),
    footer: parseText(o.footer),
  };
}

export function samePageSetup(a: PageSetup, b: PageSetup): boolean {
  return (
    a.pageSize === b.pageSize &&
    a.orientation === b.orientation &&
    a.marginPreset === b.marginPreset &&
    a.margins.top === b.margins.top &&
    a.margins.bottom === b.margins.bottom &&
    a.margins.left === b.margins.left &&
    a.margins.right === b.margins.right &&
    (["left", "center", "right"] as const).every((k) => a.header[k] === b.header[k] && a.footer[k] === b.footer[k])
  );
}

/** A change to the setup: any subset. Margins travel as `marginPreset` (+ `margins` for CUSTOM). */
export type PageSetupChange = Partial<PageSetup>;

/** The setup after `change`, used for the optimistic update (the server's answer replaces it). */
export function mergePageSetup(previous: PageSetup, change: PageSetupChange): PageSetup {
  const preset = change.marginPreset ?? (change.margins ? "CUSTOM" : previous.marginPreset);
  const margins = change.margins
    ? change.margins
    : change.marginPreset
      ? resolveMargins(change.marginPreset, previous.margins)
      : previous.margins;
  return { ...previous, ...change, marginPreset: preset, margins };
}

/** The body for PATCH /api/groups/:id/document/page-setup. A named preset sends only its name. */
export function pageSetupPatchBody(change: PageSetupChange): Record<string, unknown> {
  const { margins, marginPreset, ...rest } = change;
  const body: Record<string, unknown> = { ...rest };
  const preset = marginPreset ?? (margins ? "CUSTOM" : undefined);
  if (preset) body.marginPreset = preset;
  if (preset === "CUSTOM" && margins) {
    body.marginTop = margins.top;
    body.marginBottom = margins.bottom;
    body.marginLeft = margins.left;
    body.marginRight = margins.right;
  }
  return body;
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
    .updatePageSize(paginationSize(setup.pageSize, setup.orientation, setup.marginPreset, setup.margins))
    .updateHeaderContent(hl, hr)
    .updateFooterContent(fl, fr)
    .run();
}
