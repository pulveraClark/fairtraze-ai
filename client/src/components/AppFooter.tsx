import type { ReactNode } from "react";
import { useOptionalRouter } from "../router";
import { FOCUS_LIGHT } from "./ui";

/** The one safety message shown at the bottom of every signed-in page. */
export const FOOTER_NOTE = "Outputs are evidence to support instructor judgment — they do not constitute grades or final assessments.";

/**
 * Shared page footer: the "not a grade" note plus a small link to the Help page.
 * `children` replaces the note for pages whose message differs (e.g. Notifications).
 */
export function AppFooter({ children, printHidden = false, className = "" }: { children?: ReactNode; printHidden?: boolean; className?: string }) {
  const router = useOptionalRouter();
  return (
    <footer className={`${printHidden ? "print:hidden " : ""}border-t border-slate-200 bg-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3 sm:px-8">
        <p className="text-xs leading-normal text-slate-700">{children ?? FOOTER_NOTE}</p>
        <a
          href="/help"
          onClick={(e) => {
            if (router && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
              e.preventDefault();
              router.navigate("/help");
            }
          }}
          className={`rounded text-xs font-medium text-indigo-700 underline underline-offset-2 ${FOCUS_LIGHT}`}
        >
          How FairTraze works
        </a>
      </div>
    </footer>
  );
}
