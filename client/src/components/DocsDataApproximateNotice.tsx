// Shown when the server reports docsDataApproximate (Docs events recorded before the
// authorship-capture fix). Context only — scores are not recomputed.
export function DocsDataApproximateNotice({ fixedAt, className = "" }: { fixedAt?: string | null; className?: string }) {
  const date = fixedAt
    ? new Date(fixedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "the fix date";
  return (
    <p
      role="note"
      className={`text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ${className}`}
    >
      Docs data recorded before {date} may be approximate because of a tracking issue that has since been fixed.
    </p>
  );
}
