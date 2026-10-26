import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useToast } from "../components/Toast";
import { FOCUS_LIGHT } from "../components/ui/styles";

// Links from AI-review evidence to a section of the group's FairTraze Docs. Same tab: the link adds a
// history entry (?tab=document&section=<heading>), so the browser's Back button returns to the report.
// The editor scrolls to the heading by its text once the shared document has arrived; this only reads
// the document, it never writes to it.

export const SECTION_MISSING_MESSAGE = "That section may have been renamed.";

/** The URL of the Docs tab at a heading, relative to the current page. */
export function docSectionHref(heading: string, current: string = typeof window === "undefined" ? "http://localhost/" : window.location.href): string {
  const url = new URL(current);
  url.searchParams.set("tab", "document");
  url.searchParams.set("section", heading);
  url.searchParams.delete("task");
  return `${url.pathname}${url.search}`;
}

/** The section named by ?section= in a query string, or null (only meaningful on the Docs tab). */
export function sectionFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get("tab") !== "document") return null;
  const raw = params.get("section")?.trim();
  return raw ? raw : null;
}

interface DocSectionNav {
  /** The heading the Docs tab should scroll to, until the editor reports back. */
  heading: string | null;
  open: (heading: string) => void;
  /** Wire to the document's onHeadingResolved. */
  onResolved: (found: boolean) => void;
}

/**
 * Page-level state for "open this Docs section". `showDocument` switches the page to its Docs tab;
 * `syncFromLocation` re-reads ?tab= after Back/Forward so the report comes back.
 */
export function useDocSectionNav(showDocument: () => void, syncFromLocation: () => void): DocSectionNav {
  const { showToast } = useToast();
  const [heading, setHeading] = useState<string | null>(() =>
    typeof window === "undefined" ? null : sectionFromSearch(window.location.search));

  const open = useCallback((h: string) => {
    window.history.pushState(window.history.state, "", docSectionHref(h));
    setHeading(h);
    showDocument();
  }, [showDocument]);

  useEffect(() => {
    const onPop = () => {
      setHeading(sectionFromSearch(window.location.search));
      syncFromLocation();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromLocation]);

  const onResolved = useCallback((found: boolean) => {
    // Found: the editor has scrolled there. Not found: the document stays at the top and we say why.
    setHeading(null);
    if (!found) showToast({ message: SECTION_MISSING_MESSAGE });
  }, [showToast]);

  return { heading, open, onResolved };
}

const DocSectionContext = createContext<((heading: string) => void) | null>(null);
export const DocSectionProvider = DocSectionContext.Provider;

/** The page's "open this Docs section" action, or null where there is no Docs tab to open (e.g. print). */
export function useOpenDocSection(): ((heading: string) => void) | null {
  return useContext(DocSectionContext);
}

const LINK =
  `inline-flex min-h-10 min-w-0 max-w-full items-center text-sm font-medium text-blue-800 underline decoration-blue-800/40 underline-offset-2 hover:decoration-blue-800 ${FOCUS_LIGHT}`;

/** A Docs section heading as a link; plain text when the page cannot open the Docs tab. */
export function DocSectionLink({ heading, children }: { heading: string; children?: ReactNode }) {
  const open = useOpenDocSection();
  if (!open) return <span className="min-w-0 [overflow-wrap:anywhere]">{children ?? heading}</span>;
  return (
    <a
      href={docSectionHref(heading)}
      aria-label={`Open section ${heading} in Docs`}
      className={LINK}
      onClick={(e) => {
        // Let the browser handle new-tab gestures (ctrl/cmd/shift/middle click) with the real URL.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        open(heading);
      }}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{children ?? heading}</span>
    </a>
  );
}
