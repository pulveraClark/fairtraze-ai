import { useEffect, useState } from "react";

/** True once `active` has stayed true for `ms`; goes back to false as soon as `active` ends. */
export function useSlowAfter(active: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return slow;
}
