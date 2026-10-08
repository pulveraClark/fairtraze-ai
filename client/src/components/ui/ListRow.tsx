import type { ReactNode, Ref } from "react";
import { FOCUS_LIGHT } from "./styles";

interface Props {
  children: ReactNode;
  /** Receives the row element so the caller can hand it to a Drawer as the focus-return target. */
  onClick: (el: HTMLButtonElement) => void;
  ariaLabel?: string;
  /** Set when the row opens a drawer/dialog. */
  opensDialog?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Full-width clickable row, at least 44px tall, with a visible focus outline. */
export function ListRow({ children, onClick, ariaLabel, opensDialog, className = "", ref }: Props) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={ariaLabel}
      aria-haspopup={opensDialog ? "dialog" : undefined}
      onClick={(e) => onClick(e.currentTarget)}
      className={`block min-h-11 w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${FOCUS_LIGHT} focus-visible:-outline-offset-2 ${className}`}
    >
      {children}
    </button>
  );
}
