// Shared class strings for the report-page building blocks. rem units only, buttons 36px (min-h-9), rows 40px (min-h-10)
// hit areas, and a visible outline on every interactive element.

export const FOCUS_LIGHT =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

export const BUTTON_BASE =
  `inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${FOCUS_LIGHT}`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-600 disabled:bg-slate-100`;
export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-indigo-700 text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-600`;

/** 32px-tall variants for dense page-header action rows. */
const compact = (cls: string) => cls.replace("min-h-9", "min-h-8").replace("px-3.5", "px-3");
export const BUTTON_SECONDARY_COMPACT = compact(BUTTON_SECONDARY);
export const BUTTON_PRIMARY_COMPACT = compact(BUTTON_PRIMARY);

export const CARD = "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
