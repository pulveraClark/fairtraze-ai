import type { NavIconName } from "../../lib/navModel";

const PATHS: Record<NavIconName, string[]> = {
  home: ["M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10"],
  classes: ["M12 14l9-5-9-5-9 5 9 5zM12 14l6.16-3.422A12.083 12.083 0 0121 17.5M12 14l-6.16-3.422A12.083 12.083 0 003 17.5M12 14v7"],
  disputes: ["M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"],
  bell: ["M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"],
  settings: [
    "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    "M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  ],
  audit: ["M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"],
};

function Svg({ paths, className = "h-5 w-5" }: { paths: string[]; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false">
      {paths.map((d) => <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />)}
    </svg>
  );
}

export function NavIcon({ name }: { name: NavIconName }) {
  return <Svg paths={PATHS[name]} />;
}
export const MenuIcon     = () => <Svg paths={["M4 6h16M4 12h16M4 18h16"]} />;
export const CloseIcon    = () => <Svg paths={["M6 18L18 6M6 6l12 12"]} />;
export const SignOutIcon  = () => <Svg paths={["M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"]} />;
/** Chevron pointing down; rotate for open/closed states. */
export const ChevronIcon  = ({ className }: { className?: string }) => <Svg paths={["M19 9l-7 7-7-7"]} className={className ?? "h-4 w-4"} />;
/** Double chevron; flipped with CSS when the rail is collapsed. */
export const CollapseIcon = ({ className }: { className?: string }) => <Svg paths={["M11 19l-7-7 7-7m8 14l-7-7 7-7"]} className={className} />;
