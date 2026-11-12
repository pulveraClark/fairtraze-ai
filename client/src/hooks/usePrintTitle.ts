import { useEffect } from "react";

// The browser prints document.title in its header when headers are on, so a long app title would appear on the
// paper. Sets a short title for the print only (beforeprint/afterprint), or for as long as the component is
// mounted when `whileMounted` is true (the bulk export is mounted only while printing).
export function usePrintTitle(title: string, whileMounted = false) {
  useEffect(() => {
    const previous = document.title;
    const set = () => { document.title = title; };
    const restore = () => { document.title = previous; };
    if (whileMounted) {
      set();
      return restore;
    }
    window.addEventListener("beforeprint", set);
    window.addEventListener("afterprint", restore);
    return () => {
      window.removeEventListener("beforeprint", set);
      window.removeEventListener("afterprint", restore);
      restore();
    };
  }, [title, whileMounted]);
}
