import { useEffect, useState } from "react";

function read(px: number): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(`(min-width: ${px}px)`).matches;
  } catch {
    return false;
  }
}

/** True when the viewport is at least `px` wide (false where matchMedia is missing); updates live. */
export function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(() => read(px));
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [px]);
  return wide;
}
