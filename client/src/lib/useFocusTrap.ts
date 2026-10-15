import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true");
}

/**
 * Modal-dialog keyboard behaviour (WCAG 2.1.2 / 2.4.3): Tab and Shift+Tab cycle inside the dialog,
 * Escape closes it, and when it unmounts focus goes back to where it came from (`restoreFocus`,
 * e.g. the editor) or, failing that, to the element that was focused when it opened.
 * Attach the returned ref to the dialog container. Used by the link, page setup and header/footer
 * dialogs.
 */
export function useFocusTrap<T extends HTMLElement>(onClose: () => void, restoreFocus?: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  const restoreRef = useRef(restoreFocus);
  closeRef.current = onClose;
  restoreRef.current = restoreFocus;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableIn(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Keep focus from escaping by other means (clicking the scrim, programmatic focus).
    const onFocusIn = (e: FocusEvent) => {
      if (!root.contains(e.target as Node)) {
        const items = focusableIn(root);
        (items[0] ?? root).focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      // After the dialog is removed from the DOM.
      queueMicrotask(() => {
        if (restoreRef.current) restoreRef.current();
        else if (opener && document.contains(opener)) opener.focus();
      });
    };
  }, []);

  return ref;
}
