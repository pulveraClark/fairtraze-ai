// Says where a piece of text came from. AI-written text gets the indigo "AI" pill; the facts-only
// fallback (a list of changed files, no AI involved) gets a grey pill that never says "AI findings".
// Text always carries the meaning; the icons are decoration (aria-hidden). Colors are the 100/900
// pairs used by PILL_TONES (contrast above 4.5:1), and the pill wraps instead of overflowing.

export type AiBadgeVariant = "ai" | "facts" | "writing";

const PILL = "inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-normal";

export function SparkleIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm7 11l.9 2.6L22.5 16l-2.6.9L19 19.5l-.9-2.6-2.6-.9 2.6-.9L19 13z" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function AiBadge({ variant, label = "AI findings" }: { variant: AiBadgeVariant; label?: string }) {
  if (variant === "facts") {
    return (
      <span className={`${PILL} border-slate-300 bg-slate-100 text-slate-900`}>
        <ListIcon />
        Changed files only
      </span>
    );
  }
  if (variant === "writing") {
    return (
      <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
        <span role="status" className={`${PILL} border-indigo-300 bg-indigo-100 text-indigo-900`}>
          <SpinnerIcon />
          {label} · writing…
        </span>
        <span className="text-xs leading-normal text-slate-700">This takes about a minute. You can keep using the page.</span>
      </span>
    );
  }
  return (
    <span className={`${PILL} border-indigo-300 bg-indigo-100 text-indigo-900`}>
      <SparkleIcon />
      {label}
    </span>
  );
}
