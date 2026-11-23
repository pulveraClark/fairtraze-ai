import type { ReactNode } from "react";

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}]+$/;

/** Splits plain text into text and http(s) URL segments. Nothing here is ever parsed as HTML. */
export function splitLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trail = url.match(TRAILING_PUNCT)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Plain text with preserved line breaks and auto-linked http(s) URLs. Rendered as React text nodes (escaped). */
export function Linkified({ text, linkClassName }: { text: string; linkClassName?: string }): ReactNode {
  return (
    <>
      {splitLinks(text).map((seg, i) =>
        seg.href ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={linkClassName ?? "text-indigo-700 underline underline-offset-2 break-all"}
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
