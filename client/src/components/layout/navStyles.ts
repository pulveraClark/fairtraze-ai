// Shared class strings for sidebar controls. Everything here is sized for readability:
// rem units, >= 44px (min-h-11) hit areas, and a visible white focus outline on the dark surface.

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white";

/** Top-level nav row (link or button). Active state is shape + weight, not colour alone. */
export function navItemClass(active: boolean, collapsed: boolean): string {
  return [
    "flex w-full min-h-11 items-center rounded-lg text-base",
    collapsed ? "justify-center" : "gap-3 px-3 text-left",
    active
      ? "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_0_#a5b4fc]"
      : "font-medium text-slate-300 hover:bg-white/5 hover:text-white",
    FOCUS_RING,
  ].join(" ");
}

/** Tooltip shown beside a collapsed-rail item on hover or keyboard focus (parent needs `group relative`). */
export const RAIL_TOOLTIP =
  "pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white shadow-lg ring-1 ring-white/20 group-hover:block group-focus-within:block";
