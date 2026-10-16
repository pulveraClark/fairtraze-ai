import { PaginationPlus } from "tiptap-pagination-plus";
import { resolvePageGeometry, type PageSizeKey, type PageOrientation, type MarginPresetKey, type MarginsIn } from "@shared/pageSizes";

/** Gap between sheets on screen. The print instance uses 0 (everything else identical). */
/**
 * tiptap-pagination-plus measures `editor.view.dom` inside its plugin state's `apply`. With
 * collaboration, the first sync transactions can be applied BEFORE TipTap v3 has mounted the view,
 * and the `view` getter then throws ("The editor view is not available") — breaking the editor.
 * Until the view exists there is nothing to measure, so keep the previous decorations; the next
 * transaction after mount (the editor nudges one — see DocumentEditor.tsx) lays the pages out.
 * Any other error is still thrown.
 */
const PaginationPlusSafe = PaginationPlus.extend({
  addProseMirrorPlugins() {
    const plugins = this.parent?.() ?? [];
    for (const plugin of plugins) {
      const state = plugin.spec.state;
      const apply = state?.apply;
      if (!state || !apply) continue;
      state.apply = (tr, value, oldState, newState) => {
        try {
          return apply.call(state, tr, value, oldState, newState);
        } catch (err) {
          if (err instanceof Error && /view is not available/i.test(err.message)) return value;
          throw err;
        }
      };
    }
    return plugins;
  },
});

export const SCREEN_PAGE_GAP_PX = 24;

/** Gray stage color the gap is painted with, so sheets read as separate paper. */
export const STAGE_BG = "#cbd5e1";

export function paginationSize(size: PageSizeKey, orientation: PageOrientation = "PORTRAIT", margins: MarginPresetKey = "NORMAL", custom?: MarginsIn | null) {
  const g = resolvePageGeometry(size, orientation, margins, custom);
  return {
    pageWidth: g.widthPx,
    pageHeight: g.heightPx,
    marginTop: g.marginTopPx,
    marginBottom: g.marginBottomPx,
    marginLeft: g.marginLeftPx,
    marginRight: g.marginRightPx,
  };
}

/**
 * One configuration for both the live editor and the print instance. No header/footer/page
 * numbers (the app adds none of its own). Only `gap` differs between screen and print.
 */
export function paginationExtension(
  size: PageSizeKey,
  gap: number,
  orientation: PageOrientation = "PORTRAIT",
  margins: MarginPresetKey = "NORMAL",
  custom?: MarginsIn | null
) {
  return PaginationPlusSafe.configure({
    ...paginationSize(size, orientation, margins, custom),
    pageGap: gap,
    pageGapBorderSize: 0,
    pageBreakBackground: STAGE_BG,
    contentMarginTop: 0,
    contentMarginBottom: 0,
    headerLeft: "",
    headerRight: "",
    footerLeft: "",
    footerRight: "",
  });
}
