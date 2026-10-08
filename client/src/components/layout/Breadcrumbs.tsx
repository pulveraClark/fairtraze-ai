import { useRouter } from "../../router";

export interface Crumb {
  label: string;
  /** Omit on the last crumb (the current page). */
  href?: string;
}

/** Page trail shown above the page title. Links are real anchors with 44px-tall hit areas. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { navigate } = useRouter();
  return (
    <nav aria-label="Breadcrumb" className="print:hidden">
      <ol className="flex flex-wrap items-center text-sm">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center">
              {c.href && !last ? (
                <a
                  href={c.href}
                  onClick={(e) => {
                    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    navigate(c.href!);
                  }}
                  className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                  {c.label}
                </a>
              ) : (
                <span aria-current={last ? "page" : undefined} className="inline-flex min-h-11 items-center truncate px-1 font-semibold text-slate-800">
                  {c.label}
                </span>
              )}
              {!last && <span aria-hidden="true" className="px-1 text-slate-400">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
