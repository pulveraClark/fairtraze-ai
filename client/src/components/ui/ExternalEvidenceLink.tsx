import { FOCUS_LIGHT } from "./styles";

// One link look for AI-review evidence, so a file, a commit and a Docs section behave the same for every
// role. Display only. Targets are at least 40px tall and the text wraps, so nothing scrolls sideways at
// 375px.

const LINK =
  `inline-flex min-h-10 min-w-0 max-w-full items-center gap-1 text-sm font-medium text-blue-800 underline decoration-blue-800/40 underline-offset-2 hover:decoration-blue-800 ${FOCUS_LIGHT}`;

export function ExternalLinkIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path d="M11 3h6v6" />
      <path d="M17 3 9 11" />
      <path d="M15 11v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export function baseName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The accessible name of a file link; says where it goes and that it opens a new tab. */
export function fileLinkLabel(path: string, isCommit: boolean): string {
  return `Open ${baseName(path)} ${isCommit ? "changes" : "file"} on GitHub (new tab)`;
}

export function ExternalEvidenceLink({
  href, label, children,
}: {
  /** Absent for reviews written before links existed: the text is then shown as it was, unlinked. */
  href?: string;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) return <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={LINK}>
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      <ExternalLinkIcon />
    </a>
  );
}

/** A changed file: the newest commit's diff, then "+N more" with one link per other commit. */
export function FileEvidenceLink({
  path, href, isCommit, more,
}: {
  path: string;
  href?: string;
  isCommit?: boolean;
  more?: Array<{ sha: string; href: string }>;
}) {
  return (
    <span className="flex min-w-0 flex-col">
      <ExternalEvidenceLink href={href} label={fileLinkLabel(path, isCommit !== false)}>{path}</ExternalEvidenceLink>
      {more && more.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-700">
          <span>+{more.length} more</span>
          {more.map((m) => (
            <a
              key={m.sha}
              href={m.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open commit ${m.sha} on GitHub (new tab)`}
              className={`inline-flex min-h-10 items-center gap-1 font-medium text-blue-800 underline underline-offset-2 ${FOCUS_LIGHT}`}
            >
              <span className="tabular-nums">{m.sha}</span>
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
