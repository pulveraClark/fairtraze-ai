import { useEffect, useRef } from "react";

export interface TaskShortcutHandlers {
  /** C: new task. */
  create?: () => void;
  /** /: focus the search box. */
  search?: () => void;
  /** ?: open the shortcuts dialog. */
  help?: () => void;
  /** J / K: move to the next / previous task. */
  step?: (direction: 1 | -1) => void;
  /** Esc, when no dialog or panel is open. */
  escape?: () => void;
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "file", "color", "range"]);

/** True when keys should go to the thing being typed in, not to a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("textarea, select")) return true;
  // Checkboxes, radios and buttons take no typed text, so shortcuts keep working after ticking a row.
  const input = target.closest("input");
  if (input && !NON_TEXT_INPUTS.has(input.type)) return true;
  // jsdom has no isContentEditable, so look at the attribute as well.
  return (target as HTMLElement).isContentEditable === true || target.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

const modalOpen = () => document.querySelector('[role="dialog"][aria-modal="true"]') !== null;

/**
 * Single-key shortcuts for the Tasks tab. They never fire while typing in an input, textarea, select
 * or contenteditable, or with Ctrl, Cmd or Alt held. While a dialog or panel is open they stand down
 * (it handles its own Esc and traps focus). Enter needs no handler: J and K move real keyboard focus
 * to a task's title button, and Enter on a focused button opens it.
 */
export function useTaskShortcuts(handlers: TaskShortcutHandlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;
      if (modalOpen()) return;
      const h = ref.current;
      const run = (fn: (() => void) | undefined) => {
        if (!fn) return;
        e.preventDefault();
        fn();
      };
      switch (e.key) {
        case "c": case "C": run(h.create); break;
        case "/": run(h.search); break;
        case "?": run(h.help); break;
        case "j": case "J": run(h.step ? () => h.step!(1) : undefined); break;
        case "k": case "K": run(h.step ? () => h.step!(-1) : undefined); break;
        case "Escape": run(h.escape); break;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
